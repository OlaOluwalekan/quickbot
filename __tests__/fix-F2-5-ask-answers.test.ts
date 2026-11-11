/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationOnMessage,
  streamAnnotationAnswer,
  setAnnotationCustomProviderForTesting,
} from "@/server/services/annotation";
import {
  runQuestionBatch,
  setQuestionBatchCustomProviderForTesting,
} from "@/server/services/question-batch";
import {
  buildAskContext,
  windowTargetText,
  MAX_TARGET_TOKENS,
} from "@/server/ai/ask-context";
import type { AiProvider, StreamEvent, GenerateRequest } from "@/server/ai/types";
import type { Actor } from "@/server/auth/session";

class FakeAskProvider implements AiProvider {
  id = "gemini" as const;
  thoughtText = "I will answer focused on the highlighted snippet.";
  answerText = "This is a first-class Ask answer with citations.";
  shouldFail = false;

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    if (this.shouldFail) {
      throw new Error("Provider exploded");
    }
    yield { type: "thought_delta", text: this.thoughtText };
    yield { type: "text_delta", text: this.answerText };
    yield {
      type: "citation",
      url: "https://example.com/docs",
      title: "Example Documentation",
      snippet: "Documentation snippet",
      source: "GROUNDING",
    };
    yield { type: "usage", inputTokens: 50, outputTokens: 25, estimated: false };
    yield { type: "done", finishReason: "stop" };
  }
}

class FakeBatchProvider implements AiProvider {
  id = "gemini" as const;
  answers: Array<{ id: string; answer: string }> = [];

  constructor(answers: Array<{ id: string; answer: string }> = []) {
    this.answers = answers;
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    yield {
      type: "text_delta",
      text: JSON.stringify(this.answers),
    };
    yield {
      type: "usage",
      inputTokens: 100,
      outputTokens: 50,
      estimated: false,
    };
    yield { type: "done", finishReason: "stop" };
  }
}

async function drainStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("Fix F2.5 — Ask Answers as First-Class Responses & Context", () => {
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let workspace: { id: string };
  let ownerActor: Actor;
  let memberActor: Actor;
  let response1: { id: string };
  let response2: { id: string };
  let version1: { id: string };
  let fakeAskProvider: FakeAskProvider;

  beforeAll(async () => {
    fakeAskProvider = new FakeAskProvider();
    setAnnotationCustomProviderForTesting(fakeAskProvider);

    owner = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f25-owner-${Date.now()}@example.com`,
        name: "F25 Owner",
        username: `f25owner_${Date.now()}`,
      },
    });

    member = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f25-member-${Date.now()}@example.com`,
        name: "F25 Member",
        username: `f25member_${Date.now()}`,
      },
    });

    ownerActor = {
      userId: owner.id,
      sessionId: `sess_${owner.id}`,
      email: owner.email,
      role: "USER",
    };

    memberActor = {
      userId: member.id,
      sessionId: `sess_${member.id}`,
      email: member.email,
      role: "USER",
    };

    workspace = await db.workspace.create({
      data: {
        ownerId: owner.id,
        title: "F25 Ask Workspace",
        members: {
          create: [
            {
              userId: member.id,
              role: "EDITOR",
              invitedById: owner.id,
              canComment: true,
              canAsk: true,
            },
          ],
        },
      },
    });

    // Main response 1
    response1 = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        origin: "DIRECT",
        prompt: "First main question about PostgreSQL",
        quote: null,
      },
    });

    version1 = await db.responseVersion.create({
      data: {
        responseId: response1.id,
        number: 1,
        content: "PostgreSQL is a powerful open-source object-relational database system.",
        modelKey: "text-economy",
        providerModelId: "gemini-pro",
        promptVersion: "v1",
        status: "COMPLETE",
        createdById: owner.id,
      },
    });

    await db.response.update({
      where: { id: response1.id },
      data: { activeVersionId: version1.id },
    });

    // Main response 2 (should NEVER be included in response1's ask context)
    response2 = await db.response.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        origin: "DIRECT",
        prompt: "Unrelated question about Redis caching",
        quote: null,
      },
    });

    const v2 = await db.responseVersion.create({
      data: {
        responseId: response2.id,
        number: 1,
        content: "Redis is an in-memory data structure store used as a database cache.",
        modelKey: "text-economy",
        providerModelId: "gemini-pro",
        promptVersion: "v1",
        status: "COMPLETE",
        createdById: owner.id,
      },
    });

    await db.response.update({
      where: { id: response2.id },
      data: { activeVersionId: v2.id },
    });
  });

  afterAll(async () => {
    setAnnotationCustomProviderForTesting(null);
    setQuestionBatchCustomProviderForTesting(null);
  });

  describe("windowTargetText", () => {
    it("returns original text when token count is under MAX_TARGET_TOKENS", () => {
      const shortText = "# Heading\n\nShort paragraph about databases.";
      const windowed = windowTargetText(shortText, "databases");
      expect(windowed).toBe(shortText);
    });

    it("windows text exceeding 12k tokens and includes markdown heading outline", () => {
      // 1 token approx 4 characters. Create ~60k chars of markdown with headings.
      const heading1 = "# Section One";
      const heading2 = "## Section Two";
      const paddingBefore = "Alpha ".repeat(4000);
      const targetAnchor = "THE_ANCHORED_PHRASE";
      const paddingAfter = "Omega ".repeat(4000);

      const hugeText = `${heading1}\n\n${paddingBefore}\n\n${heading2}\n\n${targetAnchor}\n\n${paddingAfter}`;
      const windowed = windowTargetText(hugeText, targetAnchor);

      expect(windowed).toContain("Document Outline:");
      expect(windowed).toContain(heading1);
      expect(windowed).toContain(heading2);
      expect(windowed).toContain(targetAnchor);
      expect(windowed).toContain("[... preceding content truncated ...]");
      expect(windowed).toContain("[... following content truncated ...]");
    });
  });

  describe("buildAskContext", () => {
    it("RESPONSE_VERSION target: includes parent version text and original prompt, excludes other workspace responses", async () => {
      const annot = await createAnnotation(memberActor, version1.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "object-relational database system" },
        text: "What does object-relational mean?",
      });

      const ctx = await buildAskContext(annot.id, { language: "en", webSearch: true });

      expect(ctx.system).toContain("The user highlighted a passage in the text below and asked a side question.");
      const userMessageText = ctx.messages[0].parts[0].type === "text" ? ctx.messages[0].parts[0].text : "";

      // Contains version1 content and response1 prompt
      expect(userMessageText).toContain("PostgreSQL is a powerful open-source object-relational database system.");
      expect(userMessageText).toContain("First main question about PostgreSQL");
      expect(userMessageText).toContain("object-relational database system");
      expect(userMessageText).toContain("What does object-relational mean?");

      // Never contains response2 content or prompt!
      expect(userMessageText).not.toContain("Redis is an in-memory data structure store");
      expect(userMessageText).not.toContain("Unrelated question about Redis caching");
    });

    it("ANNOTATION_MESSAGE target: includes parent answer and its question, excludes main responses", async () => {
      // Create root annotation (shared with workspace)
      const rootAnnot = await createAnnotation(ownerActor, version1.id, {
        kind: "ASK",
        mode: "now",
        visibility: "WORKSPACE",
        anchor: { exact: "PostgreSQL" },
        text: "Why use PostgreSQL?",
      });

      // Stream root answer to produce an assistant message
      const { stream } = await streamAnnotationAnswer(ownerActor, rootAnnot.id, {});
      await drainStream(stream);

      const assistantMsg = await db.annotationMessage.findFirst({
        where: { annotationId: rootAnnot.id, role: "ASSISTANT" },
      });
      expect(assistantMsg).toBeTruthy();

      // Create nested Ask (depth 1) on the assistant message
      const nestedAnnot = await createAnnotationOnMessage(memberActor, assistantMsg!.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "first-class Ask answer" },
        text: "Can you elaborate on this?",
      });

      expect(nestedAnnot.depth).toBe(1);

      const nestedCtx = await buildAskContext(nestedAnnot.id, { language: "en", webSearch: true });
      const userMessageText = nestedCtx.messages[0].parts[0].type === "text" ? nestedCtx.messages[0].parts[0].text : "";

      // Contains the parent assistant answer and parent question
      expect(userMessageText).toContain(assistantMsg!.content);
      expect(userMessageText).toContain("Why use PostgreSQL?");
      expect(userMessageText).toContain("first-class Ask answer");
      expect(userMessageText).toContain("Can you elaborate on this?");

      // Excludes main timeline responses
      expect(userMessageText).not.toContain("PostgreSQL is a powerful open-source object-relational database system.");
      expect(userMessageText).not.toContain("Redis");
    });
  });

  describe("streamAnnotationAnswer", () => {
    it("creates ASSISTANT message upfront with STREAMING status, then finalizes with COMPLETE and thoughtSummary/citations", async () => {
      const annot = await createAnnotation(memberActor, version1.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "powerful open-source" },
        text: "What makes it powerful?",
      });

      fakeAskProvider.thoughtText = "Analyzing technical capabilities...";
      fakeAskProvider.answerText = "Its concurrency and extensibility.";
      fakeAskProvider.shouldFail = false;

      const { stream, messageId, annotationId } = await streamAnnotationAnswer(
        memberActor,
        annot.id,
        { idempotencyKey: `test_stream_${Date.now()}` }
      );

      // Verify upfront assistant message existed
      const streamingMsg = await db.annotationMessage.findUnique({
        where: { id: messageId },
      });
      expect(streamingMsg).toBeTruthy();
      expect(streamingMsg?.role).toBe("ASSISTANT");

      // Drain stream
      const sseText = await drainStream(stream);
      expect(sseText).toContain("event: started");
      expect(sseText).toContain("event: delta");
      expect(sseText).toContain("event: completed");
      expect(sseText).toContain("event: done");

      // Verify finalized message
      const finalizedMsg = await db.annotationMessage.findUnique({
        where: { id: messageId },
      });
      expect(finalizedMsg?.status).toBe("COMPLETE");
      expect(finalizedMsg?.content).toBe("Its concurrency and extensibility.");
      expect(finalizedMsg?.thoughtSummary).toBe("Analyzing technical capabilities...");
      expect(finalizedMsg?.citations).toBeTruthy();

      // Verify annotation questionState marked ANSWERED
      const updatedAnnot = await db.annotation.findUnique({
        where: { id: annotationId },
      });
      expect(updatedAnnot?.questionState).toBe("ANSWERED");
    });

    it("marks message as FAILED when provider fails, allowing retry", async () => {
      const annot = await createAnnotation(memberActor, version1.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "powerful open-source" },
        text: "Will this fail?",
      });

      fakeAskProvider.shouldFail = true;

      const { stream, messageId } = await streamAnnotationAnswer(
        memberActor,
        annot.id,
        { idempotencyKey: `test_fail_${Date.now()}` }
      );

      await drainStream(stream);

      const failedMsg = await db.annotationMessage.findUnique({
        where: { id: messageId },
      });
      expect(failedMsg?.status).toBe("FAILED");

      // Retry: provider works
      fakeAskProvider.shouldFail = false;
      fakeAskProvider.answerText = "Recovered answer on retry.";

      const retryRes = await streamAnnotationAnswer(
        memberActor,
        annot.id,
        { idempotencyKey: `test_retry_${Date.now()}` }
      );

      await drainStream(retryRes.stream);

      const retryMsg = await db.annotationMessage.findUnique({
        where: { id: retryRes.messageId },
      });
      expect(retryMsg?.status).toBe("COMPLETE");
      expect(retryMsg?.content).toBe("Recovered answer on retry.");
    });
  });

  describe("runQuestionBatch with polymorphic targets", () => {
    it("groups queued questions on a response version AND on an answer message, answering both in one batch", async () => {
      // 1. Queued question on ResponseVersion (depth 0)
      const q1 = await createAnnotation(memberActor, version1.id, {
        kind: "ASK",
        mode: "queue",
        anchor: { exact: "database system" },
        text: "Batch Q1 on main version",
      });
      expect(q1.questionState).toBe("QUEUED");

      // 2. Create parent answer (shared with workspace)
      const parentAnnot = await createAnnotation(ownerActor, version1.id, {
        kind: "ASK",
        mode: "now",
        visibility: "WORKSPACE",
        anchor: { exact: "open-source" },
        text: "Parent Q for batch test",
      });
      fakeAskProvider.shouldFail = false;
      fakeAskProvider.answerText = "Parent answer text for nested queue test.";
      const parentStream = await streamAnnotationAnswer(ownerActor, parentAnnot.id, {});
      await drainStream(parentStream.stream);

      const parentMsg = await db.annotationMessage.findFirst({
        where: { annotationId: parentAnnot.id, role: "ASSISTANT" },
      });
      expect(parentMsg).toBeTruthy();

      // 3. Queued question on AnnotationMessage (depth 1)
      const q2 = await createAnnotationOnMessage(memberActor, parentMsg!.id, {
        kind: "ASK",
        mode: "queue",
        anchor: { exact: "nested queue test" },
        text: "Batch Q2 on nested answer",
      });
      expect(q2.questionState).toBe("QUEUED");
      expect(q2.depth).toBe(1);

      // Set up batch provider answers
      const batchProvider = new FakeBatchProvider([
        { id: q1.id, answer: "Answer for Q1" },
        { id: q2.id, answer: "Answer for Q2" },
      ]);
      setQuestionBatchCustomProviderForTesting(batchProvider);

      // Run question batch
      const batchResult = await runQuestionBatch(
        memberActor,
        workspace.id,
        { annotationIds: [q1.id, q2.id] },
        { providerInstance: batchProvider }
      );

      expect(batchResult.count).toBe(2);
      await drainStream(batchResult.stream);

      // Both should be marked ANSWERED
      const updatedQ1 = await db.annotation.findUnique({
        where: { id: q1.id },
        include: { messages: true },
      });
      const updatedQ2 = await db.annotation.findUnique({
        where: { id: q2.id },
        include: { messages: true },
      });

      expect(updatedQ1?.questionState).toBe("ANSWERED");
      expect(updatedQ2?.questionState).toBe("ANSWERED");

      const q1AssistantMsg = updatedQ1?.messages.find((m) => m.role === "ASSISTANT");
      const q2AssistantMsg = updatedQ2?.messages.find((m) => m.role === "ASSISTANT");

      expect(q1AssistantMsg?.content).toBe("Answer for Q1");
      expect(q1AssistantMsg?.status).toBe("COMPLETE");
      expect(q2AssistantMsg?.content).toBe("Answer for Q2");
      expect(q2AssistantMsg?.status).toBe("COMPLETE");
    });
  });
});
