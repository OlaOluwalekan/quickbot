/**
 * @jest-environment node
 *
 * F2.7 — Promotion from any depth (L1/L2/L3) with bidirectional provenance,
 * project target authorization, privacy isolation, and graceful source deletion.
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { POST as promoteRoute } from "@/app/api/v1/annotations/[id]/promote/route";
import { GET as workspaceRoute } from "@/app/api/v1/workspaces/[id]/route";
import { GET as responsesRoute } from "@/app/api/v1/workspaces/[id]/responses/route";
import { GET as chainRoute } from "@/app/api/v1/annotations/[id]/chain/route";

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

const jsonData = async (res: Response) => {
  const b = await res.json();
  return b && typeof b === "object" && "data" in b ? b.data : b;
};

describe("F2.7 — Promotion from any depth with provenance links", () => {
  const suffix = `f27_${Date.now()}`;
  const ownerId = `user_owner_${suffix}`;
  const editorId = `user_editor_${suffix}`;
  const guestId = `user_guest_${suffix}`;

  let projectAId: string;
  let projectBId: string;
  let projectViewerId: string;
  let sourceWsId: string;
  let rootResponseId: string;
  let rootVersionId: string;

  let l1Id: string;
  let l1AssistantMsgId: string;
  let l2Id: string;
  let l2AssistantMsgId: string;
  let l3Id: string;
  let l3AssistantMsgId: string;
  let privateAnnotId: string;
  let privateAssistantMsgId: string;

  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db.user.createMany({
      data: [
        { id: ownerId, email: `owner_${suffix}@example.com`, name: "Owner" },
        { id: editorId, email: `editor_${suffix}@example.com`, name: "Editor" },
        { id: guestId, email: `guest_${suffix}@example.com`, name: "Guest" },
      ],
    });

    const projectA = await db.project.create({
      data: { name: "Project Alpha", ownerId },
    });
    projectAId = projectA.id;

    const projectB = await db.project.create({
      data: { name: "Project Beta", ownerId: guestId },
    });
    projectBId = projectB.id;
    await db.projectMember.create({
      data: {
        projectId: projectBId,
        userId: editorId,
        role: "EDITOR",
        invitedById: guestId,
      },
    });

    const projectViewer = await db.project.create({
      data: { name: "Project ReadOnly", ownerId: guestId },
    });
    projectViewerId = projectViewer.id;
    await db.projectMember.create({
      data: {
        projectId: projectViewerId,
        userId: editorId,
        role: "VIEWER",
        invitedById: guestId,
      },
    });

    const srcWs = await db.workspace.create({
      data: {
        title: "Research Source Workspace",
        ownerId,
        projectId: projectAId,
      },
    });
    sourceWsId = srcWs.id;
    createdWorkspaceIds.push(sourceWsId);

    await db.workspaceMember.create({
      data: {
        workspaceId: sourceWsId,
        userId: editorId,
        role: "EDITOR",
        invitedById: ownerId,
      },
    });

    const resp = await db.response.create({
      data: {
        workspaceId: sourceWsId,
        createdById: ownerId,
        prompt: "Explain consensus algorithms",
      },
    });
    rootResponseId = resp.id;

    const ver = await db.responseVersion.create({
      data: {
        responseId: rootResponseId,
        number: 1,
        status: "COMPLETE",
        content: "Raft elects a leader using randomized election timeouts.",
        modelKey: "text-standard",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    rootVersionId = ver.id;

    await db.response.update({
      where: { id: rootResponseId },
      data: { activeVersionId: rootVersionId },
    });

    // L1 (depth 0)
    const l1 = await db.annotation.create({
      data: {
        workspaceId: sourceWsId,
        responseId: rootResponseId,
        versionId: rootVersionId,
        targetType: "RESPONSE_VERSION",
        depth: 0,
        createdById: ownerId,
        kind: "ASK",
        questionState: "ANSWERED",
        visibility: "WORKSPACE",
        anchorExact: "randomized election timeouts",
        anchorPrefix: "using ",
        anchorSuffix: ".",
      },
    });
    l1Id = l1.id;

    await db.annotationMessage.create({
      data: {
        annotationId: l1Id,
        role: "USER",
        content: "Why randomize timeouts?",
        authorId: ownerId,
      },
    });
    const l1Asst = await db.annotationMessage.create({
      data: {
        annotationId: l1Id,
        role: "ASSISTANT",
        content: "Randomization breaks symmetry and prevents split votes.",
        modelKey: "text-standard",
        createdAt: new Date(Date.now() - 30_000),
      },
    });
    l1AssistantMsgId = l1Asst.id;

    // L2 (depth 1) on L1's answer
    const l2 = await db.annotation.create({
      data: {
        workspaceId: sourceWsId,
        targetType: "ANNOTATION_MESSAGE",
        targetMessageId: l1AssistantMsgId,
        parentAnnotationId: l1Id,
        rootAnnotationId: l1Id,
        depth: 1,
        createdById: editorId,
        kind: "ASK",
        questionState: "ANSWERED",
        visibility: "WORKSPACE",
        anchorExact: "split votes",
        anchorPrefix: "prevents ",
        anchorSuffix: ".",
      },
    });
    l2Id = l2.id;

    await db.annotationMessage.create({
      data: {
        annotationId: l2Id,
        role: "USER",
        content: "What happens during a split vote?",
        authorId: editorId,
      },
    });
    const l2Asst = await db.annotationMessage.create({
      data: {
        annotationId: l2Id,
        role: "ASSISTANT",
        content: "No candidate gets a majority, so a new term starts after backoff.",
        modelKey: "text-pro",
        createdAt: new Date(Date.now() - 20_000),
      },
    });
    l2AssistantMsgId = l2Asst.id;

    // L3 (depth 2) on L2's answer, with thoughtSummary + citations
    const l3 = await db.annotation.create({
      data: {
        workspaceId: sourceWsId,
        targetType: "ANNOTATION_MESSAGE",
        targetMessageId: l2AssistantMsgId,
        parentAnnotationId: l2Id,
        rootAnnotationId: l1Id,
        depth: 2,
        createdById: editorId,
        kind: "ASK",
        questionState: "ANSWERED",
        visibility: "WORKSPACE",
        anchorExact: "a new term starts",
        anchorPrefix: "so ",
        anchorSuffix: " after backoff.",
      },
    });
    l3Id = l3.id;

    await db.annotationMessage.create({
      data: {
        annotationId: l3Id,
        role: "USER",
        content: "Does term increment on every node?",
        authorId: editorId,
      },
    });
    const l3Asst = await db.annotationMessage.create({
      data: {
        annotationId: l3Id,
        role: "ASSISTANT",
        content: "Only voters advancing to candidate increment their currentTerm first.",
        thoughtSummary: "Checking Raft section 5.2 term rules.",
        citations: [
          {
            index: 1,
            url: "https://raft.github.io/raft.pdf",
            title: "Raft Paper",
            snippet: "Section 5.2 Leader election",
            source: "GROUNDING",
          },
        ],
        modelKey: "text-pro",
        createdAt: new Date(Date.now() - 10_000),
      },
    });
    l3AssistantMsgId = l3Asst.id;

    // Private annotation owned by owner (editor shouldn't be able to promote)
    const priv = await db.annotation.create({
      data: {
        workspaceId: sourceWsId,
        responseId: rootResponseId,
        versionId: rootVersionId,
        targetType: "RESPONSE_VERSION",
        depth: 0,
        createdById: ownerId,
        kind: "ASK",
        questionState: "ANSWERED",
        visibility: "PRIVATE",
        anchorExact: "leader",
        anchorPrefix: "elects a ",
        anchorSuffix: " using",
      },
    });
    privateAnnotId = priv.id;
    await db.annotationMessage.create({
      data: {
        annotationId: privateAnnotId,
        role: "USER",
        content: "Private question",
        authorId: ownerId,
      },
    });
    const privAsst = await db.annotationMessage.create({
      data: {
        annotationId: privateAnnotId,
        role: "ASSISTANT",
        content: "Private answer",
      },
    });
    privateAssistantMsgId = privAsst.id;
  }, 20000);

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db.workspace.deleteMany({ where: { id } }).catch(() => {});
    }
    await db.project
      .deleteMany({ where: { id: { in: [projectAId, projectBId, projectViewerId] } } })
      .catch(() => {});
    await db.user
      .deleteMany({ where: { id: { in: [ownerId, editorId, guestId] } } })
      .catch(() => {});
  }, 20000);

  it("blocks promoting another member's PRIVATE annotation (404)", async () => {
    mockActorId = editorId;
    const req = new NextRequest(
      `http://localhost/api/v1/annotations/${privateAnnotId}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: privateAssistantMsgId,
          target: "TIMELINE",
        }),
      }
    );
    const res = await promoteRoute(req, {
      params: Promise.resolve({ id: privateAnnotId }),
    });
    expect(res.status).toBe(404);
  });

  it("promotes an L3 nested Ask answer to TIMELINE with full ancestor chain", async () => {
    mockActorId = editorId;
    const req = new NextRequest(
      `http://localhost/api/v1/annotations/${l3Id}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: l3AssistantMsgId,
          target: "TIMELINE",
        }),
      }
    );
    const res = await promoteRoute(req, { params: Promise.resolve({ id: l3Id }) });
    expect(res.status).toBe(200);
    const data = await jsonData(res);
    expect(data.alreadyPromoted).toBe(false);
    expect(data.target).toBe("TIMELINE");
    expect(data.destinationWorkspaceId).toBe(sourceWsId);

    // Check promoted response & version fields
    const resp = await db.response.findUnique({
      where: { id: data.destinationResponseId },
      include: { versions: { include: { citations: true } } },
    });
    expect(resp).toBeTruthy();
    expect(resp?.origin).toBe("PROMOTED");
    expect(resp?.quote).toBe("a new term starts");
    expect(resp?.sourceAnnotationId).toBe(l3Id);
    expect(resp?.versions[0]?.thoughtSummary).toBe(
      "Checking Raft section 5.2 term rules."
    );
    expect(resp?.versions[0]?.citations).toHaveLength(1);
    expect(resp?.versions[0]?.citations[0]?.url).toBe(
      "https://raft.github.io/raft.pdf"
    );

    // Idempotent repeat returns 200 with alreadyPromoted: true
    const req2 = new NextRequest(
      `http://localhost/api/v1/annotations/${l3Id}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: l3AssistantMsgId,
          target: "TIMELINE",
        }),
      }
    );
    const res2 = await promoteRoute(req2, { params: Promise.resolve({ id: l3Id }) });
    expect(res2.status).toBe(200);
    const data2 = await jsonData(res2);
    expect(data2.alreadyPromoted).toBe(true);
    expect(data2.id).toBe(data.id);

    // Responses endpoint returns ordered L1 -> L2 -> L3 sourceChain
    const respListReq = new NextRequest(
      `http://localhost/api/v1/workspaces/${sourceWsId}/responses`
    );
    const respListRes = await responsesRoute(respListReq, {
      params: Promise.resolve({ id: sourceWsId }),
    });
    expect(respListRes.status).toBe(200);
    const respListBody = await jsonData(respListRes);
    const promoted = respListBody.items.find(
      (i: { id: string }) => i.id === data.destinationResponseId
    );
    expect(promoted).toBeTruthy();
    expect(promoted.sourceAccessible).toBe(true);
    expect(promoted.sourceRemoved).toBe(false);
    expect(promoted.sourceChain).toEqual([
      { id: l1Id, quote: "randomized election timeouts", depth: 0 },
      { id: l2Id, quote: "split votes", depth: 1 },
      { id: l3Id, quote: "a new term starts", depth: 2 },
    ]);
  });

  it("rejects NEW_WORKSPACE promotion into a project without workspace.generate (403)", async () => {
    mockActorId = editorId;
    const req = new NextRequest(
      `http://localhost/api/v1/annotations/${l2Id}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: l2AssistantMsgId,
          target: "NEW_WORKSPACE",
          projectId: projectViewerId,
        }),
      }
    );
    const res = await promoteRoute(req, { params: Promise.resolve({ id: l2Id }) });
    expect(res.status).toBe(403);
  });

  it("promotes an L2 Ask answer into a NEW_WORKSPACE in another project with provenance + access boundaries", async () => {
    mockActorId = editorId;
    const req = new NextRequest(
      `http://localhost/api/v1/annotations/${l2Id}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: l2AssistantMsgId,
          target: "NEW_WORKSPACE",
          projectId: projectBId,
        }),
      }
    );
    const res = await promoteRoute(req, { params: Promise.resolve({ id: l2Id }) });
    expect(res.status).toBe(200);
    const data = await jsonData(res);
    expect(data.target).toBe("NEW_WORKSPACE");
    expect(data.destinationWorkspaceTitle).toBe("What happens during a split vote?");
    createdWorkspaceIds.push(data.destinationWorkspaceId);

    const createdWs = await db.workspace.findUnique({
      where: { id: data.destinationWorkspaceId },
    });
    expect(createdWs?.projectId).toBe(projectBId);
    expect(createdWs?.sourceWorkspaceId).toBe(sourceWsId);
    expect(createdWs?.sourceAnnotationId).toBe(l2Id);
    expect(createdWs?.sourceMessageId).toBe(l2AssistantMsgId);

    // Editor CAN read source workspace -> full sourceProvenance + sourceChain
    const wsResEditor = await workspaceRoute(
      new NextRequest(`http://localhost/api/v1/workspaces/${data.destinationWorkspaceId}`),
      { params: Promise.resolve({ id: data.destinationWorkspaceId }) }
    );
    const wsEditor = await jsonData(wsResEditor);
    expect(wsEditor.sourceProvenance).toEqual({
      canAccess: true,
      removed: false,
      sourceWorkspaceId: sourceWsId,
      sourceWorkspaceTitle: "Research Source Workspace",
      sourceAnnotationId: l2Id,
      threadParam: `${l1Id},${l2Id}`,
      annotationRemoved: false,
    });

    // Guest is owner of projectB (can read the new workspace) but CANNOT read sourceWs!
    mockActorId = guestId;
    const wsResGuest = await workspaceRoute(
      new NextRequest(`http://localhost/api/v1/workspaces/${data.destinationWorkspaceId}`),
      { params: Promise.resolve({ id: data.destinationWorkspaceId }) }
    );
    expect(wsResGuest.status).toBe(200);
    const wsGuest = await jsonData(wsResGuest);
    expect(wsGuest.sourceProvenance).toEqual({
      canAccess: false,
      removed: false,
    });

    // Guest also should NOT get sourceChain leaked via responses endpoint
    const respGuestRes = await responsesRoute(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${data.destinationWorkspaceId}/responses`
      ),
      { params: Promise.resolve({ id: data.destinationWorkspaceId }) }
    );
    const respGuest = await jsonData(respGuestRes);
    expect(respGuest.items[0].sourceAccessible).toBe(false);
    expect(respGuest.items[0].sourceChain).toBeNull();
    expect(respGuest.items[0].quote).toBe("split votes");

    // Owner of sourceWs CAN read chain, but CANNOT read projectB destination workspace -> title withheld
    mockActorId = ownerId;
    const chainResOwner = await chainRoute(
      new NextRequest(`http://localhost/api/v1/annotations/${l2Id}/chain`),
      { params: Promise.resolve({ id: l2Id }) }
    );
    const chainOwner = await jsonData(chainResOwner);
    const l2Node = chainOwner.find((a: { id: string }) => a.id === l2Id);
    const newWsPromo = l2Node.promotions.find(
      (p: { target: string }) => p.target === "NEW_WORKSPACE"
    );
    expect(newWsPromo.destinationAccessible).toBe(false);
    expect(newWsPromo.destinationWorkspaceTitle).toBeNull();
  });

  it("handles source deletion gracefully without breaking destination workspace or response", async () => {
    // Promote L1 to NEW_WORKSPACE inside projectA (owner creates it)
    mockActorId = ownerId;
    const promoRes = await promoteRoute(
      new NextRequest(`http://localhost/api/v1/annotations/${l1Id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: l1AssistantMsgId,
          target: "NEW_WORKSPACE",
          projectId: projectAId,
        }),
      }),
      { params: Promise.resolve({ id: l1Id }) }
    );
    expect(promoRes.status).toBe(200);
    const promo = await jsonData(promoRes);
    createdWorkspaceIds.push(promo.destinationWorkspaceId);

    // Delete source annotation L3
    await db.annotation.update({
      where: { id: l3Id },
      data: { deletedAt: new Date() },
    });

    // Source timeline promoted response still renders with sourceRemoved: true
    const srcRespRes = await responsesRoute(
      new NextRequest(`http://localhost/api/v1/workspaces/${sourceWsId}/responses`),
      { params: Promise.resolve({ id: sourceWsId }) }
    );
    const srcRespBody = await jsonData(srcRespRes);
    const removedTimelineCard = srcRespBody.items.find(
      (i: { sourceAnnotationId?: string | null }) => i.sourceAnnotationId === l3Id
    );
    expect(removedTimelineCard.sourceRemoved).toBe(true);
    expect(removedTimelineCard.quote).toBe("a new term starts");

    // Soft-delete the entire source workspace -> destination workspace still opens & reports removed: true
    await db.workspace.update({
      where: { id: sourceWsId },
      data: { deletedAt: new Date() },
    });

    const destWsRes = await workspaceRoute(
      new NextRequest(`http://localhost/api/v1/workspaces/${promo.destinationWorkspaceId}`),
      { params: Promise.resolve({ id: promo.destinationWorkspaceId }) }
    );
    expect(destWsRes.status).toBe(200);
    const destWsBody = await jsonData(destWsRes);
    expect(destWsBody.sourceProvenance).toEqual({
      canAccess: false,
      removed: true,
    });

    const destRespRes = await responsesRoute(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${promo.destinationWorkspaceId}/responses`
      ),
      { params: Promise.resolve({ id: promo.destinationWorkspaceId }) }
    );
    expect(destRespRes.status).toBe(200);
    const destRespBody = await jsonData(destRespRes);
    expect(destRespBody.items[0].sourceRemoved).toBe(true);
    expect(destRespBody.items[0].quote).toBe("randomized election timeouts");
  });
});
