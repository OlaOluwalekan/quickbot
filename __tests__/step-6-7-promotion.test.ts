/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { POST as promoteRoute } from "@/app/api/v1/annotations/[id]/promote/route";

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

describe("Step 6.7 — Promotion with provenance (add to history / new workspace)", () => {
  const testSuffix = Date.now().toString();
  const ownerId = `user_owner_${testSuffix}`;
  const editorId = `user_editor_${testSuffix}`;
  const commenterId = `user_commenter_${testSuffix}`;
  const outsiderId = `user_outsider_${testSuffix}`;

  let workspaceId: string;
  let responseAId: string;
  let responseBId: string;
  let versionAId: string;
  let annotationId: string;
  let assistantMsgId: string;

  const t0 = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
  const t1 = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
  const t2 = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

  beforeAll(async () => {
    // 1. Create test users
    const users = [
      { id: ownerId, email: `owner_${testSuffix}@example.com`, name: "Owner" },
      { id: editorId, email: `editor_${testSuffix}@example.com`, name: "Editor" },
      { id: commenterId, email: `commenter_${testSuffix}@example.com`, name: "Commenter" },
      { id: outsiderId, email: `outsider_${testSuffix}@example.com`, name: "Outsider" },
    ];
    for (const u of users) {
      await db.user.create({ data: u });
    }

    // 2. Create workspace
    const ws = await db.workspace.create({
      data: {
        title: "Promotion Test Workspace",
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

    // 4. Create Response A at T0
    const respA = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "First initial question about databases",
        sortAt: t0,
        createdAt: t0,
      },
    });
    responseAId = respA.id;

    const verA = await db.responseVersion.create({
      data: {
        responseId: responseAId,
        number: 1,
        status: "COMPLETE",
        content: "Relational databases use ACID transactions to guarantee data consistency.",
        modelKey: "text-standard",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
        createdAt: t0,
      },
    });
    versionAId = verA.id;

    await db.response.update({
      where: { id: responseAId },
      data: { activeVersionId: versionAId },
    });

    // 5. Create Response B at T2
    const respB = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "Second question about distributed systems",
        sortAt: t2,
        createdAt: t2,
      },
    });
    responseBId = respB.id;

    // 6. Create Annotation on Response A with user follow-up and assistant reply at T1
    const annot = await db.annotation.create({
      data: {
        workspaceId,
        responseId: responseAId,
        versionId: versionAId,
        kind: "REPLY",
        visibility: "WORKSPACE",
        anchorExact: "ACID transactions to guarantee data consistency",
        anchorPrefix: "Relational databases use ",
        anchorSuffix: ".",
        createdById: ownerId,
        createdAt: t1,
      },
    });
    annotationId = annot.id;

    // User follow-up question
    await db.annotationMessage.create({
      data: {
        annotationId,
        role: "USER",
        authorId: ownerId,
        content: "What is the difference between isolation levels like Read Committed and Serializable?",
        createdAt: t1,
      },
    });

    // Assistant reply
    const asstMsg = await db.annotationMessage.create({
      data: {
        annotationId,
        role: "ASSISTANT",
        content: "Serializable isolation prevents phantom reads and guarantees that concurrent transactions execute as if sequentially, whereas Read Committed only prevents dirty reads.",
        createdAt: t1,
      },
    });
    assistantMsgId = asstMsg.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({
      where: {
        id: { in: [workspaceId] },
      },
    });
    await db.user.deleteMany({
      where: {
        id: { in: [ownerId, editorId, commenterId, outsiderId] },
      },
    });
  });

  it("1. Rejects unauthorized outsider and returns 404 for unknown annotation", async () => {
    mockActorId = outsiderId;

    const req = new NextRequest("http://localhost/api/v1/annotations/nonexistent/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: assistantMsgId,
        target: "TIMELINE",
      }),
    });

    const res = await promoteRoute(req, {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("2. Collaborator without workspace.generate gets 403 Forbidden on TIMELINE promotion", async () => {
    mockActorId = commenterId; // Commenter has workspace.read but not workspace.generate

    const req = new NextRequest(`http://localhost/api/v1/annotations/${annotationId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: assistantMsgId,
        target: "TIMELINE",
      }),
    });

    const res = await promoteRoute(req, {
      params: Promise.resolve({ id: annotationId }),
    });
    expect(res.status).toBe(403);
  });

  it("3. Promotes to TIMELINE: creates Response at original sortAt date, no credits charged", async () => {
    mockActorId = editorId; // Editor has workspace.generate

    const req = new NextRequest(`http://localhost/api/v1/annotations/${annotationId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: assistantMsgId,
        target: "TIMELINE",
      }),
    });

    const res = await promoteRoute(req, {
      params: Promise.resolve({ id: annotationId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    const data = json.data;
    expect(data.target).toBe("TIMELINE");
    expect(data.destinationResponseId).toBeDefined();
    expect(data.destinationWorkspaceId).toBe(workspaceId);
    expect(data.alreadyPromoted).toBe(false);

    // Verify created Response
    const promotedResp = await db.response.findUnique({
      where: { id: data.destinationResponseId },
      include: { versions: true },
    });

    expect(promotedResp).not.toBeNull();
    expect(promotedResp!.origin).toBe("PROMOTED");
    expect(promotedResp!.quote).toBe("ACID transactions to guarantee data consistency");
    expect(promotedResp!.sourceAnnotationId).toBe(annotationId);
    expect(promotedResp!.prompt).toContain("What is the difference between isolation levels");
    expect(promotedResp!.createdById).toBe(ownerId); // original annotation author
    expect(promotedResp!.versions).toHaveLength(1);
    expect(promotedResp!.versions[0]!.content).toContain("Serializable isolation prevents phantom reads");
    expect(promotedResp!.versions[0]!.sourceMessageId).toBe(assistantMsgId);
  });

  it("4. Idempotency: double-click / retry returns existing promotion with alreadyPromoted: true", async () => {
    mockActorId = editorId;

    const countBefore = await db.response.count({ where: { workspaceId } });

    const req = new NextRequest(`http://localhost/api/v1/annotations/${annotationId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: assistantMsgId,
        target: "TIMELINE",
      }),
    });

    const res = await promoteRoute(req, {
      params: Promise.resolve({ id: annotationId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    const data = json.data;
    expect(data.target).toBe("TIMELINE");
    expect(data.alreadyPromoted).toBe(true);

    const countAfter = await db.response.count({ where: { workspaceId } });
    expect(countAfter).toBe(countBefore); // No duplicate response created!
  });

  it("5. Timeline ordering: promoted answer sorts chronologically between Response A and Response B", async () => {
    const responses = await db.response.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { sortAt: "asc" },
    });

    expect(responses).toHaveLength(3);
    // Response A at T0, Promoted at T1, Response B at T2
    expect(responses[0]!.id).toBe(responseAId);
    expect(responses[1]!.origin).toBe("PROMOTED");
    expect(responses[1]!.quote).toBe("ACID transactions to guarantee data consistency");
    expect(responses[2]!.id).toBe(responseBId);
  });

  it("6. Promotes to NEW_WORKSPACE: collaborator can branch out into brand new workspace", async () => {
    mockActorId = commenterId; // Commenter has workspace.read and can branch out

    const req = new NextRequest(`http://localhost/api/v1/annotations/${annotationId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: assistantMsgId,
        target: "NEW_WORKSPACE",
      }),
    });

    const res = await promoteRoute(req, {
      params: Promise.resolve({ id: annotationId }),
    });
    expect(res.status).toBe(200);

    const json = await res.json();
    const data = json.data;
    expect(data.target).toBe("NEW_WORKSPACE");
    expect(data.destinationWorkspaceId).not.toBe(workspaceId);

    // Verify new workspace
    const newWs = await db.workspace.findUnique({
      where: { id: data.destinationWorkspaceId },
      include: { responses: { include: { versions: true } } },
    });

    expect(newWs).not.toBeNull();
    expect(newWs!.ownerId).toBe(commenterId); // owned by caller
    expect(newWs!.title.length).toBeLessThanOrEqual(60);

    // Contains exactly one response and no private history leak
    expect(newWs!.responses).toHaveLength(1);
    const newResp = newWs!.responses[0]!;
    expect(newResp.origin).toBe("PROMOTED");
    expect(newResp.quote).toBe("ACID transactions to guarantee data consistency");
    expect(newResp.versions[0]!.content).toContain("Serializable isolation prevents phantom reads");

    // Clean up branched workspace
    await db.workspace.delete({ where: { id: newWs!.id } });
  });

  it("7. Deleting annotation later does NOT delete the promoted response (provenance becomes source removed)", async () => {
    // Find promoted response
    const promo = await db.promotion.findFirst({
      where: { messageId: assistantMsgId, target: "TIMELINE" },
    });
    expect(promo).not.toBeNull();

    // Soft delete the annotation
    await db.annotation.update({
      where: { id: annotationId },
      data: { deletedAt: new Date() },
    });

    // Promoted response in timeline still exists!
    const promotedResp = await db.response.findUnique({
      where: { id: promo!.destinationResponseId! },
    });
    expect(promotedResp).not.toBeNull();
    expect(promotedResp!.deletedAt).toBeNull();
    expect(promotedResp!.sourceAnnotationId).toBe(annotationId);

    // Verify that the source annotation is now detached/soft-deleted
    const sourceAnnot = await db.annotation.findFirst({
      where: { id: promotedResp!.sourceAnnotationId!, deletedAt: null },
    });
    expect(sourceAnnot).toBeNull(); // Source is removed, provenance cleanly handles detached source
  });
});
