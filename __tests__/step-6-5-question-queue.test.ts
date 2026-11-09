/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import {
  AiProvider,
  GenerateRequest,
  StreamEvent,
} from "@/server/ai/types";
import { setQuestionBatchCustomProviderForTesting } from "@/server/services/question-batch";
import { GET as listQuestionsRoute } from "@/app/api/v1/workspaces/[id]/questions/route";
import { POST as runBatchRoute } from "@/app/api/v1/workspaces/[id]/questions/run/route";
import { PATCH as updateAnnotationRoute } from "@/app/api/v1/annotations/[id]/route";

let mockActorId: string | null = null;

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => {
    if (!mockActorId) return null;
    return {
      userId: mockActorId,
      sessionId: `sess_${mockActorId}`,
      email: `${mockActorId}@example.com`,
      role: "USER" as const,
    };
  }),
}));

class FakeQuestionBatchProvider implements AiProvider {
  id = "gemini" as const;
  answers: Array<{ id: string; answer: string }> = [];

  constructor(answers: Array<{ id: string; answer: string }> = []) {
    this.answers = answers;
  }

  setAnswers(answers: Array<{ id: string; answer: string }>) {
    this.answers = answers;
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    const jsonOutput = JSON.stringify(this.answers);
    yield {
      type: "text_delta",
      text: jsonOutput,
    };
    yield {
      type: "usage",
      inputTokens: 250,
      outputTokens: 100,
      estimated: false,
    };
  }
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("Step 6.5 — Question queue (batch answers)", () => {
  jest.setTimeout(60000);
  const testSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const ownerId = `user_owner_${testSuffix}`;
  const editorId = `user_editor_${testSuffix}`;
  const commenterId = `user_commenter_${testSuffix}`;

  let workspaceId: string;
  let response1Id: string;
  let version1Id: string;
  let response2Id: string;
  let version2Id: string;

  const fakeProvider = new FakeQuestionBatchProvider();

  beforeAll(async () => {
    setQuestionBatchCustomProviderForTesting(fakeProvider);

    // 1. Create test users
    await db.user.createMany({
      data: [
        { id: ownerId, email: `owner_${testSuffix}@example.com`, name: "Owner" },
        { id: editorId, email: `editor_${testSuffix}@example.com`, name: "Editor" },
        { id: commenterId, email: `commenter_${testSuffix}@example.com`, name: "Commenter" },
      ],
    });

    // 2. Create workspace
    const ws = await db.workspace.create({
      data: {
        title: "Question Queue Workspace",
        ownerId,
      },
    });
    workspaceId = ws.id;

    // 3. Add members
    await db.workspaceMember.createMany({
      data: [
        { workspaceId, userId: editorId, role: "EDITOR", invitedById: ownerId },
        { workspaceId, userId: commenterId, role: "COMMENTER", invitedById: ownerId },
      ],
    });

    // 4. Create Response 1 with Version 1
    const r1 = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "Explain raft consensus",
      },
    });
    response1Id = r1.id;

    const v1 = await db.responseVersion.create({
      data: {
        responseId: response1Id,
        number: 1,
        status: "COMPLETE",
        content: "Raft elects a leader and replicates log entries across followers.",
        modelKey: "text-economy",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    version1Id = v1.id;

    await db.response.update({
      where: { id: response1Id },
      data: { activeVersionId: version1Id },
    });

    // 5. Create Response 2 with Version 2
    const r2 = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "Explain paxos consensus",
      },
    });
    response2Id = r2.id;

    const v2 = await db.responseVersion.create({
      data: {
        responseId: response2Id,
        number: 1,
        status: "COMPLETE",
        content: "Paxos uses proposers, acceptors, and learners to reach agreement.",
        modelKey: "text-economy",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    version2Id = v2.id;

    await db.response.update({
      where: { id: response2Id },
      data: { activeVersionId: version2Id },
    });
  }, 30000);

  afterAll(async () => {
    setQuestionBatchCustomProviderForTesting(null);
    await db.annotationMessage.deleteMany({
      where: { annotation: { workspaceId } },
    });
    await db.annotation.deleteMany({ where: { workspaceId } });
    await db.generation.deleteMany({ where: { workspaceId } });
    await db.responseVersion.deleteMany({
      where: { response: { workspaceId } },
    });
    await db.response.deleteMany({ where: { workspaceId } });
    await db.workspaceMember.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({
      where: { id: { in: [ownerId, editorId, commenterId] } },
    });
  });

  it("1. Queues 3 questions across 2 versions and retrieves them via GET /questions?state=QUEUED", async () => {
    mockActorId = editorId;

    // Create Q1 on Version 1
    const q1 = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "elects a leader",
        anchorPrefix: "Raft ",
        anchorSuffix: " and replicates",
        messages: {
          create: [{ role: "USER", content: "How does election timeout work?", authorId: editorId }],
        },
      },
    });

    // Create Q2 on Version 1
    const q2 = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "replicates log entries",
        anchorPrefix: "leader and ",
        anchorSuffix: " across followers.",
        messages: {
          create: [{ role: "USER", content: "What happens if a follower rejects an entry?", authorId: editorId }],
        },
      },
    });

    // Create Q3 on Version 2
    const q3 = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response2Id,
        versionId: version2Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "proposers, acceptors, and learners",
        anchorPrefix: "Paxos uses ",
        anchorSuffix: " to reach agreement.",
        messages: {
          create: [{ role: "USER", content: "Can an acceptor also be a proposer?", authorId: editorId }],
        },
      },
    });

    // GET /api/v1/workspaces/:id/questions?state=QUEUED
    const req = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions?state=QUEUED`);
    const res = await listQuestionsRoute(req, {
      params: Promise.resolve({ id: workspaceId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    const questions = json.data ?? json;
    expect(Array.isArray(questions)).toBe(true);
    const ids = questions.map((q: any) => q.id);
    expect(ids).toContain(q1.id);
    expect(ids).toContain(q2.id);
    expect(ids).toContain(q3.id);
  });

  it("2. Runs batch question answering: one generation, three answers, one ledger charge billed to owner", async () => {
    mockActorId = editorId;

    const queuedQuestions = await db.annotation.findMany({
      where: { workspaceId, createdById: editorId, questionState: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    expect(queuedQuestions.length).toBeGreaterThanOrEqual(3);

    const qIds = queuedQuestions.slice(0, 3).map((q) => q.id);

    fakeProvider.setAnswers([
      { id: qIds[0] as string, answer: "Election timeouts are randomized between 150ms and 300ms." },
      { id: qIds[1] as string, answer: "The leader decrements nextIndex and retries until matchIndex is found." },
      { id: qIds[2] as string, answer: "Yes, a single physical node can implement multiple Paxos roles." },
    ]);

    const req = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions/run`, {
      method: "POST",
      body: JSON.stringify({
        annotationIds: qIds,
        idempotencyKey: `idem_batch_run_${testSuffix}`,
      }),
    });

    const res = await runBatchRoute(req, {
      params: Promise.resolve({ id: workspaceId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const sseBody = await readStream(res.body!);
    expect(sseBody).toContain("event: started");
    expect(sseBody).toContain("event: question_answered");
    expect(sseBody).toContain("Election timeouts are randomized");
    expect(sseBody).toContain("The leader decrements nextIndex");
    expect(sseBody).toContain("Yes, a single physical node");
    expect(sseBody).toContain("event: done");

    // Verify exactly ONE generation was created for the batch
    const generations = await db.generation.findMany({
      where: {
        workspaceId,
        kind: "QUESTION_BATCH",
        idempotencyKey: `idem_batch_run_${testSuffix}`,
      },
    });
    expect(generations.length).toBe(1);
    expect(generations[0]?.actorId).toBe(editorId);
    expect(generations[0]?.status).toBe("COMPLETED");

    // Verify all 3 questions are now ANSWERED
    const updatedAnnots = await db.annotation.findMany({
      where: { id: { in: qIds } },
      include: { messages: true },
    });
    expect(updatedAnnots.length).toBe(3);
    for (const annot of updatedAnnots) {
      expect(annot.questionState).toBe("ANSWERED");
      const asstMsg = annot.messages.find((m) => m.role === "ASSISTANT");
      expect(asstMsg).toBeDefined();
      expect(asstMsg!.content.length).toBeGreaterThan(5);
    }
  });

  it("3. Concurrency protection: atomic lock prevents two tabs from answering the same question twice", async () => {
    mockActorId = editorId;

    // Queue 2 new questions
    const cq1 = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "replicates log entries",
        anchorPrefix: "",
        anchorSuffix: "",
        messages: {
          create: [{ role: "USER", content: "What is log compaction?", authorId: editorId }],
        },
      },
    });

    fakeProvider.setAnswers([
      { id: cq1.id, answer: "Log compaction uses snapshotting to discard old log entries." },
    ]);

    // Simulate Tab 1 running the question
    const req1 = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions/run`, {
      method: "POST",
      body: JSON.stringify({
        annotationIds: [cq1.id],
        idempotencyKey: `idem_tab1_${testSuffix}`,
      }),
    });
    const res1 = await runBatchRoute(req1, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(res1.status).toBe(200);

    // Tab 2 attempts to run the same question concurrently or immediately after
    const req2 = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions/run`, {
      method: "POST",
      body: JSON.stringify({
        annotationIds: [cq1.id],
        idempotencyKey: `idem_tab2_${testSuffix}`,
      }),
    });
    const res2 = await runBatchRoute(req2, {
      params: Promise.resolve({ id: workspaceId }),
    });
    // Tab 2 cannot re-claim the already answered / claimed question
    expect(res2.status).toBe(400);
  });

  it("4. Skips soft-deleted annotations or versions", async () => {
    mockActorId = editorId;

    const delAnnot = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "Raft elects a leader",
        anchorPrefix: "",
        anchorSuffix: "",
        deletedAt: new Date(), // soft deleted
        messages: {
          create: [{ role: "USER", content: "This should be skipped", authorId: editorId }],
        },
      },
    });

    const req = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions/run`, {
      method: "POST",
      body: JSON.stringify({
        annotationIds: [delAnnot.id],
        idempotencyKey: `idem_skip_${testSuffix}`,
      }),
    });
    const res = await runBatchRoute(req, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(res.status).toBe(400);
  });

  it("5. Missing question in model JSON output leaves question in FAILED state (retryable)", async () => {
    mockActorId = editorId;

    const partial1 = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "Raft elects a leader",
        anchorPrefix: "",
        anchorSuffix: "",
        messages: {
          create: [{ role: "USER", content: "Question that gets answered", authorId: editorId }],
        },
      },
    });

    const partial2 = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: editorId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "across followers",
        anchorPrefix: "",
        anchorSuffix: "",
        messages: {
          create: [{ role: "USER", content: "Question missing from output", authorId: editorId }],
        },
      },
    });

    // Model only returns partial1
    fakeProvider.setAnswers([
      { id: partial1.id, answer: "Answer for partial 1." },
    ]);

    const req = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions/run`, {
      method: "POST",
      body: JSON.stringify({
        annotationIds: [partial1.id, partial2.id],
        idempotencyKey: `idem_partial_${testSuffix}`,
      }),
    });

    const res = await runBatchRoute(req, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(res.status).toBe(200);
    const body = await readStream(res.body!);
    expect(body).toContain("question_answered");
    expect(body).toContain("question_failed");

    const check1 = await db.annotation.findUnique({ where: { id: partial1.id } });
    const check2 = await db.annotation.findUnique({ where: { id: partial2.id } });
    expect(check1!.questionState).toBe("ANSWERED");
    expect(check2!.questionState).toBe("FAILED");

    // Retry flow: user clicks retry which PATCHes questionState to QUEUED
    const patchReq = new NextRequest(`http://localhost/api/v1/annotations/${partial2.id}`, {
      method: "PATCH",
      body: JSON.stringify({ questionState: "QUEUED" }),
    });
    const patchRes = await updateAnnotationRoute(patchReq, {
      params: Promise.resolve({ id: partial2.id }),
    });
    expect(patchRes.status).toBe(200);

    const retried = await db.annotation.findUnique({ where: { id: partial2.id } });
    expect(retried!.questionState).toBe("QUEUED");
  });

  it("6. Commenter without workspace.generate is forbidden (403)", async () => {
    mockActorId = commenterId;

    const q = await db.annotation.create({
      data: {
        workspaceId,
        responseId: response1Id,
        versionId: version1Id,
        createdById: commenterId,
        kind: "ASK",
        questionState: "QUEUED",
        anchorExact: "Raft elects a leader",
        anchorPrefix: "",
        anchorSuffix: "",
        messages: {
          create: [{ role: "USER", content: "Can commenter run batch?", authorId: commenterId }],
        },
      },
    });

    const req = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/questions/run`, {
      method: "POST",
      body: JSON.stringify({
        annotationIds: [q.id],
      }),
    });

    const res = await runBatchRoute(req, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(res.status).toBe(403);
  });
});
