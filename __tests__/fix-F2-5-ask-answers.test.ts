/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationOnMessage,
  listAnnotationsForMessage,
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
} from "@/server/ai/ask-context";
import type { AiProvider, StreamEvent, GenerateRequest, Msg } from "@/server/ai/types";
import type { Actor } from "@/server/auth/session";

class FakeAskProvider implements AiProvider {
  id = "gemini" as const;
  thoughtText = "I will answer focused on the highlighted snippet.";
  answerText = "This is a first-class Ask answer with citations.";
  shouldFail = false;

  async *stream(): AsyncIterable<StreamEvent> {
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
  lastRequest: GenerateRequest | null = null;

  constructor(answers: Array<{ id: string; answer: string }> = []) {
    this.answers = answers;
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    this.lastRequest = req;
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

/** Text of the n-th message of a built context. */
function textOf(messages: Msg[], index = 0): string {
  const part = messages[index]?.parts[0];
  return part?.type === "text" ? part.text : "";
}

let keySeq = 0;
/** A fresh idempotency key (every answer request needs one). */
function key(label: string): string {
  return `f25_${label}_${Date.now()}_${keySeq++}`;
}

describe("Fix F2.5 — Ask Answers as First-Class Responses & Context", () => {
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let outsider: { id: string; email: string };
  let outsiderActor: Actor;
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

    outsider = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f25-outsider-${Date.now()}@example.com`,
        name: "F25 Outsider",
        username: `f25outsider_${Date.now()}`,
      },
    });
    outsiderActor = {
      userId: outsider.id,
      sessionId: `sess_${outsider.id}`,
      email: outsider.email,
      role: "USER",
    };

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
      const userMessageText = textOf(ctx.messages);

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
      const { stream } = await streamAnnotationAnswer(ownerActor, rootAnnot.id, {
        idempotencyKey: key("root"),
      });
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
      const userMessageText = textOf(nestedCtx.messages);

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
        { idempotencyKey: key("stream") }
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

      expect(finalizedMsg?.modelKey).toBeTruthy();
      expect(finalizedMsg?.citations).toEqual([
        expect.objectContaining({ index: 1, url: "https://example.com/docs" }),
      ]);
      expect(sseText).toContain("event: thought");
      expect(sseText).toContain("event: citation");

      // An asked-now Ask stays out of the queue states.
      const updatedAnnot = await db.annotation.findUnique({
        where: { id: annotationId },
      });
      expect(updatedAnnot?.questionState).toBe("NONE");

      // Billed to the workspace owner, the member recorded as the actor.
      const generation = await db.generation.findUnique({
        where: { id: finalizedMsg!.generationId! },
      });
      const ownerAccount = await db.creditAccount.findUnique({
        where: { userId: owner.id },
      });
      expect(generation?.kind).toBe("ANNOTATION_REPLY");
      expect(generation?.status).toBe("COMPLETED");
      expect(generation?.actorId).toBe(member.id);
      expect(generation?.billedAccountId).toBe(ownerAccount?.id);

      // Nothing is waiting any more: asking again is refused (no second answer).
      await expect(
        streamAnnotationAnswer(memberActor, annot.id, { idempotencyKey: key("again") })
      ).rejects.toMatchObject({ status: 400 });
      expect(
        await db.annotationMessage.count({
          where: { annotationId: annot.id, role: "ASSISTANT" },
        })
      ).toBe(1);
    });

    it("answers a follow-up with the thread so far, and refuses a repeated request", async () => {
      const annot = await createAnnotation(memberActor, version1.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "powerful open-source" },
        text: "First question?",
      });
      fakeAskProvider.shouldFail = false;
      fakeAskProvider.answerText = "First answer.";
      await drainStream(
        (await streamAnnotationAnswer(memberActor, annot.id, { idempotencyKey: key("first") }))
          .stream
      );

      fakeAskProvider.answerText = "Second answer.";
      const followUpKey = key("followup");
      await drainStream(
        (
          await streamAnnotationAnswer(memberActor, annot.id, {
            prompt: "And a follow-up?",
            idempotencyKey: followUpKey,
          })
        ).stream
      );

      const thread = await db.annotationMessage.findMany({
        where: { annotationId: annot.id },
        orderBy: { createdAt: "asc" },
      });
      expect(thread.map((m) => [m.role, m.content])).toEqual([
        ["USER", "First question?"],
        ["ASSISTANT", "First answer."],
        ["USER", "And a follow-up?"],
        ["ASSISTANT", "Second answer."],
      ]);

      // The same request sent twice (network retry) doesn't add anything.
      await expect(
        streamAnnotationAnswer(memberActor, annot.id, {
          prompt: "And a follow-up?",
          idempotencyKey: followUpKey,
        })
      ).rejects.toMatchObject({ status: 409 });
      expect(await db.annotationMessage.count({ where: { annotationId: annot.id } })).toBe(4);

      // The context of the next turn holds the containing text once, then the thread.
      const ctx = await buildAskContext(annot.id, { language: "en" });
      expect(ctx.messages.map((m) => m.role)).toEqual([
        "user",
        "assistant",
        "user",
        "assistant",
      ]);
      expect(textOf(ctx.messages, 0)).toContain("First question?");
      expect(textOf(ctx.messages, 2)).toBe("And a follow-up?");
    });

    it("is not available to people who can't see the thread", async () => {
      const privateAsk = await createAnnotation(ownerActor, version1.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "powerful open-source" },
        text: "Owner's private question",
      });

      // Someone outside the workspace
      await expect(
        streamAnnotationAnswer(outsiderActor, privateAsk.id, { idempotencyKey: key("out") })
      ).rejects.toMatchObject({ status: 404 });
      // A member, but the thread is private to its author
      await expect(
        streamAnnotationAnswer(memberActor, privateAsk.id, { idempotencyKey: key("priv") })
      ).rejects.toMatchObject({ status: 404 });

      expect(
        await db.annotationMessage.count({
          where: { annotationId: privateAsk.id, role: "ASSISTANT" },
        })
      ).toBe(0);
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
        { idempotencyKey: key("fail") }
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
        { idempotencyKey: key("retry") }
      );

      await drainStream(retryRes.stream);

      const retryMsg = await db.annotationMessage.findUnique({
        where: { id: retryRes.messageId },
      });
      expect(retryMsg?.status).toBe("COMPLETE");
      expect(retryMsg?.content).toBe("Recovered answer on retry.");

      // The failed attempt is replaced, not kept next to the answer, and it
      // was not charged.
      const thread = await db.annotationMessage.findMany({
        where: { annotationId: annot.id },
        orderBy: { createdAt: "asc" },
      });
      expect(thread.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
      const failedGeneration = await db.generation.findUnique({
        where: { id: (failedMsg!.generationId as string) },
      });
      expect(failedGeneration?.status).toBe("FAILED");
      expect(failedGeneration?.chargedCredits).toBe(0);
      // An error category is stored, never the provider's message.
      expect(failedGeneration?.errorCode).toBe("unknown");
    });
  });

  describe("listAnnotationsForMessage (highlights inside an Ask answer)", () => {
    it("lists nested annotations to those who can see them, 404 for others", async () => {
      const parent = await createAnnotation(ownerActor, version1.id, {
        kind: "ASK",
        mode: "now",
        visibility: "WORKSPACE",
        anchor: { exact: "database system" },
        text: "Shared parent question",
      });
      fakeAskProvider.shouldFail = false;
      fakeAskProvider.answerText = "A shared answer that members can annotate.";
      const { stream, messageId } = await streamAnnotationAnswer(ownerActor, parent.id, {
        idempotencyKey: key("shared"),
      });
      await drainStream(stream);

      const memberPrivate = await createAnnotationOnMessage(memberActor, messageId, {
        kind: "COMMENT",
        anchor: { exact: "members can annotate" },
        text: "Private note of the member",
      });

      const forMember = await listAnnotationsForMessage(memberActor, messageId);
      expect(forMember.map((a) => a.id)).toEqual([memberPrivate.id]);
      // The owner doesn't see the member's private annotation.
      expect(await listAnnotationsForMessage(ownerActor, messageId)).toEqual([]);

      await expect(
        listAnnotationsForMessage(outsiderActor, messageId)
      ).rejects.toMatchObject({ status: 404 });

      // An answer of a private thread is only found by the thread's author.
      const privateParent = await createAnnotation(ownerActor, version1.id, {
        kind: "ASK",
        mode: "now",
        anchor: { exact: "database system" },
        text: "Private parent question",
      });
      const privateAnswer = await streamAnnotationAnswer(ownerActor, privateParent.id, {
        idempotencyKey: key("private"),
      });
      await drainStream(privateAnswer.stream);
      await expect(
        listAnnotationsForMessage(memberActor, privateAnswer.messageId)
      ).rejects.toMatchObject({ status: 404 });
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
      const parentStream = await streamAnnotationAnswer(ownerActor, parentAnnot.id, {
        idempotencyKey: key("parent"),
      });
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
      const responsesBefore = await db.response.count({
        where: { workspaceId: workspace.id },
      });
      await drainStream(batchResult.stream);

      // One request, two groups: each containing text is sent once.
      const batchPrompt = textOf(batchProvider.lastRequest?.messages ?? []);
      expect(batchPrompt.match(/=== CONTEXT ===/g)).toHaveLength(2);
      expect(batchPrompt).toContain(
        "PostgreSQL is a powerful open-source object-relational database system."
      );
      expect(batchPrompt).toContain("Parent answer text for nested queue test.");
      expect(batchPrompt).toContain("Parent Q for batch test");
      expect(batchPrompt).not.toContain("Redis");

      // The main timeline is untouched.
      expect(await db.response.count({ where: { workspaceId: workspace.id } })).toBe(
        responsesBefore
      );

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
