/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { Actor } from "@/server/auth/session";
import {
  AiProvider,
  GenerateRequest,
  StreamEvent,
} from "@/server/ai/types";
import { setAnnotationCustomProviderForTesting } from "@/server/services/annotation";
import { POST as createAnnotationRoute } from "@/app/api/v1/response-versions/[id]/annotations/route";
import { POST as answerRoute } from "@/app/api/v1/annotations/[id]/answer/route";
import { POST as messagesRoute } from "@/app/api/v1/annotations/[id]/messages/route";
import { GET as workspaceAnnotationsRoute } from "@/app/api/v1/workspaces/[id]/annotations/route";
import { useUiStore } from "@/lib/stores/ui";

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

class FakeAnnotationReplyProvider implements AiProvider {
  id = "gemini" as const;

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    yield {
      type: "text_delta",
      text: "Two-phase commit coordinates across nodes using prepare and commit phases.",
    };
    yield {
      type: "usage",
      inputTokens: 120,
      outputTokens: 40,
      estimated: false,
    };
  }
}

/**
 * "Ask now" as the app does it since F2.5: create the Ask, then ask for its
 * answer (POST /annotations/:id/answer). Returns the response of the step
 * that failed, or of the answer.
 */
async function askNow(
  versionId: string,
  anchor: { exact: string; prefix?: string; suffix?: string },
  text: string,
  idempotencyKey: string
): Promise<Response> {
  const createRes = await createAnnotationRoute(
    new NextRequest(
      `http://localhost/api/v1/response-versions/${versionId}/annotations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "ASK", mode: "now", anchor, text }),
      }
    ),
    { params: Promise.resolve({ id: versionId }) }
  );
  if (createRes.status >= 300) return createRes;
  const created = await createRes.json();
  const id = (created.data ?? created).id as string;

  return answerRoute(
    new NextRequest(`http://localhost/api/v1/annotations/${id}/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id }) }
  );
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

describe("Step 6.4 — Right panel and reply flow", () => {
  const testSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const ownerId = `user_owner_${testSuffix}`;
  const editorId = `user_editor_${testSuffix}`;
  const commenterId = `user_commenter_${testSuffix}`;
  const viewerId = `user_viewer_${testSuffix}`;

  let workspaceId: string;
  let responseId: string;
  let versionId: string;

  const versionContent =
    "Two-phase commit is an atomic commitment protocol. It guarantees safety but can block on coordinator failure.";

  beforeAll(async () => {
    setAnnotationCustomProviderForTesting(new FakeAnnotationReplyProvider());

    // 1. Create test users
    await db.user.createMany({
      data: [
        { id: ownerId, email: `owner_${testSuffix}@example.com`, name: "Owner" },
        { id: editorId, email: `editor_${testSuffix}@example.com`, name: "Editor" },
        { id: commenterId, email: `commenter_${testSuffix}@example.com`, name: "Commenter" },
        { id: viewerId, email: `viewer_${testSuffix}@example.com`, name: "Viewer" },
      ],
    });

    // 2. Create workspace
    const ws = await db.workspace.create({
      data: {
        title: "Reply Flow Workspace",
        ownerId,
      },
    });
    workspaceId = ws.id;

    // 3. Add members
    await db.workspaceMember.createMany({
      data: [
        { workspaceId, userId: editorId, role: "EDITOR", invitedById: ownerId },
        { workspaceId, userId: commenterId, role: "COMMENTER", invitedById: ownerId },
        { workspaceId, userId: viewerId, role: "VIEWER", invitedById: ownerId },
      ],
    });

    // 4. Create single initial response and version
    const resp = await db.response.create({
      data: {
        workspaceId,
        prompt: "Explain two-phase commit protocol",
        createdById: ownerId,
        sortAt: new Date(),
      },
    });
    responseId = resp.id;

    const ver = await db.responseVersion.create({
      data: {
        responseId,
        number: 1,
        status: "COMPLETE",
        content: versionContent,
        modelKey: "text-economy",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    versionId = ver.id;

    await db.response.update({
      where: { id: responseId },
      data: { activeVersionId: versionId },
    });
  });

  afterAll(async () => {
    setAnnotationCustomProviderForTesting(null);
    await db.annotationMessage.deleteMany({
      where: { annotation: { workspaceId } },
    });
    await db.generation.deleteMany({ where: { workspaceId } });
    await db.annotation.deleteMany({ where: { workspaceId } });
    await db.responseVersion.deleteMany({ where: { responseId } });
    await db.response.deleteMany({ where: { workspaceId } });
    await db.workspaceMember.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.creditAccount.deleteMany({
      where: { userId: { in: [ownerId, editorId, commenterId, viewerId] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [ownerId, editorId, commenterId, viewerId] } },
    });
  });

  it("1. Streams AI reply outside the main timeline and creates thread", async () => {
    mockActorId = ownerId;

    const initialResponseCount = await db.response.count({
      where: { workspaceId },
    });
    expect(initialResponseCount).toBe(1);

    const idempotencyKey = `reply_test_${Date.now()}`;
    const res = await askNow(
      versionId,
      { exact: "coordinator failure", prefix: "can block on ", suffix: "." },
      "Why can it block on coordinator failure?",
      idempotencyKey
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const sseBody = await readStream(res.body!);
    expect(sseBody).toContain("event: started");
    expect(sseBody).toContain("event: status");
    expect(sseBody).toContain("event: delta");
    expect(sseBody).toContain("Two-phase commit coordinates across nodes");
    expect(sseBody).toContain("event: done");

    // Timeline assertion: NO Response rows were created!
    const postResponseCount = await db.response.count({
      where: { workspaceId },
    });
    expect(postResponseCount).toBe(initialResponseCount);

    // Verify annotation was created in database
    const annot = await db.annotation.findFirst({
      where: { workspaceId, anchorExact: "coordinator failure" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    expect(annot).not.toBeNull();
    expect(annot?.kind).toBe("ASK");
    expect(annot?.messages).toHaveLength(2);
    expect(annot!.messages[0]!.role).toBe("USER");
    expect(annot!.messages[0]!.content).toBe("Why can it block on coordinator failure?");
    expect(annot!.messages[1]!.role).toBe("ASSISTANT");
    expect(annot!.messages[1]!.content).toContain("Two-phase commit coordinates");
    expect(annot!.messages[1]!.generationId).not.toBeNull();
  });

  it("2. Collaborator with generate permission triggers reply billed to workspace owner", async () => {
    mockActorId = editorId; // Editor has workspace.generate

    const idempotencyKey = `collab_reply_${Date.now()}`;
    const res = await askNow(
      versionId,
      {
        exact: "atomic commitment",
        prefix: "Two-phase commit is an ",
        suffix: " protocol.",
      },
      "What does atomic commitment mean here?",
      idempotencyKey
    );
    expect(res.status).toBe(200);

    const sseBody = await readStream(res.body!);
    expect(sseBody).toContain("event: done");

    // Verify Generation records collaborator as actor, but billedAccountId belongs to workspace owner
    const generation = await db.generation.findFirst({
      where: { idempotencyKey },
    });
    expect(generation).not.toBeNull();
    expect(generation?.actorId).toBe(editorId); // Collaborator is the actor

    const ownerCreditAccount = await db.creditAccount.findUnique({
      where: { userId: ownerId },
    });
    expect(generation?.billedAccountId).toBe(ownerCreditAccount?.id); // Owner billed
    expect(generation?.status).toBe("COMPLETED");
  });

  it("3. User without generate permission (e.g. commenter or viewer) is forbidden (403)", async () => {
    mockActorId = commenterId; // Commenter cannot generate

    const res = await askNow(
      versionId,
      { exact: "atomic commitment" },
      "Try to generate reply",
      `fail_${Date.now()}`
    );
    expect(res.status).toBe(403);
  });

  it("4. Follow-up reply message extends existing thread without creating responses", async () => {
    mockActorId = ownerId;

    // First find the existing reply annotation
    const existing = await db.annotation.findFirst({
      where: { workspaceId, kind: "ASK", createdById: ownerId },
      orderBy: { createdAt: "asc" },
    });
    expect(existing).not.toBeNull();

    const initialMessageCount = await db.annotationMessage.count({
      where: { annotationId: existing!.id },
    });

    const req = new NextRequest(
      `http://localhost/api/v1/annotations/${existing!.id}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": `followup_${Date.now()}`,
        },
        body: JSON.stringify({
          prompt: "How can 3PC mitigate this?",
          stream: true,
        }),
      }
    );

    const res = await messagesRoute(req, { params: Promise.resolve({ id: existing!.id }) });
    expect(res.status).toBe(200);

    const sseBody = await readStream(res.body!);
    expect(sseBody).toContain("event: done");

    const finalMessages = await db.annotationMessage.findMany({
      where: { annotationId: existing!.id },
      orderBy: { createdAt: "asc" },
    });
    expect(finalMessages.length).toBe(initialMessageCount + 2);
    expect(finalMessages[finalMessages.length - 2]!.role).toBe("USER");
    expect(finalMessages[finalMessages.length - 2]!.content).toBe("How can 3PC mitigate this?");
    expect(finalMessages[finalMessages.length - 1]!.role).toBe("ASSISTANT");

    // Timeline still unchanged
    const totalResponses = await db.response.count({ where: { workspaceId } });
    expect(totalResponses).toBe(1);
  });

  it("5. Lists workspace annotations including user-created replies and comments", async () => {
    // Add a WORKSPACE-visible comment created by editor
    await db.annotation.create({
      data: {
        workspaceId,
        responseId,
        versionId,
        kind: "COMMENT",
        visibility: "WORKSPACE",
        anchorExact: "safety",
        anchorPrefix: "",
        anchorSuffix: "",
        createdById: editorId,
        messages: {
          create: [
            {
              role: "USER",
              content: "Note on safety guarantee",
              authorId: editorId,
            },
          ],
        },
      },
    });

    mockActorId = ownerId;

    const req = new NextRequest(`http://localhost/api/v1/workspaces/${workspaceId}/annotations`);
    const res = await workspaceAnnotationsRoute(req, {
      params: Promise.resolve({ id: workspaceId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    const list = json.data ?? json;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0]).toHaveProperty("anchorExact");
    expect(list[0]).toHaveProperty("messages");
    expect(list[0]).toHaveProperty("createdBy");
  });

  it("6. UI Store manages right panel width and open state with persistence", () => {
    const store = useUiStore.getState();

    // Default width is 360
    expect(store.rightPanelWidth).toBe(360);

    // Can resize within bounds
    store.setRightPanelWidth(420);
    expect(useUiStore.getState().rightPanelWidth).toBe(420);

    // Can toggle right panel
    store.setRightPanelOpen(true);
    expect(useUiStore.getState().rightPanelOpen).toBe(true);

    store.toggleRightPanelOpen();
    expect(useUiStore.getState().rightPanelOpen).toBe(false);

    // Focus state
    store.setRightPanelFocus({
      responseId: "resp_123",
      tab: "replies",
    });
    expect(useUiStore.getState().rightPanelFocus).toEqual({
      responseId: "resp_123",
      tab: "replies",
    });
  });
});
