/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { can } from "@/server/authz/permissions";
import { GET as getAnnotationsRoute } from "@/app/api/v1/responses/[id]/annotations/route";
import { POST as createAnnotationRoute } from "@/app/api/v1/response-versions/[id]/annotations/route";
import {
  GET as getAnnotationRoute,
  PATCH as updateAnnotationRoute,
  DELETE as deleteAnnotationRoute,
} from "@/app/api/v1/annotations/[id]/route";

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

describe("Step 6.2 — Annotation API", () => {
  const testSuffix = Date.now().toString();
  const ownerId = `user_owner_${testSuffix}`;
  const adminId = `user_admin_${testSuffix}`;
  const editorId = `user_editor_${testSuffix}`;
  const commenterId = `user_commenter_${testSuffix}`;
  const viewerId = `user_viewer_${testSuffix}`;
  const outsiderId = `user_outsider_${testSuffix}`;

  let workspaceId: string;
  let responseId: string;
  let version1Id: string;
  let version2Id: string;

  const version1Content =
    "Two-phase commit is an atomic commitment protocol for distributed systems. It guarantees that all nodes either commit or abort the transaction.";
  const version2Content =
    "Raft is a consensus algorithm designed as an alternative to Paxos. It is easier to understand and implements state machine replication.";

  beforeAll(async () => {
    // 1. Create test users
    const users = [
      { id: ownerId, email: `owner_${testSuffix}@example.com`, name: "Owner" },
      { id: adminId, email: `admin_${testSuffix}@example.com`, name: "Admin" },
      { id: editorId, email: `editor_${testSuffix}@example.com`, name: "Editor" },
      { id: commenterId, email: `commenter_${testSuffix}@example.com`, name: "Commenter" },
      { id: viewerId, email: `viewer_${testSuffix}@example.com`, name: "Viewer" },
      { id: outsiderId, email: `outsider_${testSuffix}@example.com`, name: "Outsider" },
    ];
    for (const u of users) {
      await db.user.create({ data: u });
    }

    // 2. Create workspace
    const ws = await db.workspace.create({
      data: {
        title: "Annotation API Test Workspace",
        ownerId,
      },
    });
    workspaceId = ws.id;

    // 3. Add members with explicit roles
    await db.workspaceMember.createMany({
      data: [
        { workspaceId, userId: adminId, role: "ADMIN", invitedById: ownerId },
        { workspaceId, userId: editorId, role: "EDITOR", invitedById: ownerId },
        { workspaceId, userId: commenterId, role: "COMMENTER", canAsk: true, invitedById: ownerId },
        { workspaceId, userId: viewerId, role: "VIEWER", invitedById: ownerId },
      ],
    });

    // 4. Create response and versions
    const res = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "Explain distributed consensus protocols",
        kind: "TEXT",
        origin: "DIRECT",
      },
    });
    responseId = res.id;

    const v1 = await db.responseVersion.create({
      data: {
        responseId,
        number: 1,
        status: "COMPLETE",
        content: version1Content,
        modelKey: "text-standard",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    version1Id = v1.id;

    const v2 = await db.responseVersion.create({
      data: {
        responseId,
        number: 2,
        status: "COMPLETE",
        content: version2Content,
        modelKey: "text-standard",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    version2Id = v2.id;
  });

  afterAll(async () => {
    // Cleanup workspace (cascades responses, versions, annotations)
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    const userIds = [
      ownerId,
      adminId,
      editorId,
      commenterId,
      viewerId,
      outsiderId,
    ];
    for (const uid of userIds) {
      await db.user.delete({ where: { id: uid } }).catch(() => {});
    }
    await db.$disconnect();
  });

  describe("1. Permissions & Creation: POST /api/v1/response-versions/:id/annotations", () => {
    it("rejects viewer with 403 Forbidden (lacks workspace.annotate)", async () => {
      mockActorId = viewerId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${version1Id}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "COMMENT",
            anchor: {
              exact: "Two-phase commit",
              prefix: "",
              suffix: " is an atomic",
            },
            text: "Can viewers comment?",
          }),
        }
      );

      const res = await createAnnotationRoute(req, {
        params: Promise.resolve({ id: version1Id }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects outsider with 404 Not Found (no workspace leak)", async () => {
      mockActorId = outsiderId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${version1Id}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "COMMENT",
            anchor: {
              exact: "Two-phase commit",
              prefix: "",
              suffix: " is an atomic",
            },
            text: "Hello from outside",
          }),
        }
      );

      const res = await createAnnotationRoute(req, {
        params: Promise.resolve({ id: version1Id }),
      });
      expect(res.status).toBe(404);
    });

    it("rejects fabricated anchor.exact not present in version content with 400 Bad Request", async () => {
      mockActorId = commenterId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${version1Id}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "COMMENT",
            anchor: {
              exact: "This phrase definitely does not exist in version 1 content",
              prefix: "",
              suffix: "",
            },
            text: "Fabricated quote test",
          }),
        }
      );

      const res = await createAnnotationRoute(req, {
        params: Promise.resolve({ id: version1Id }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.message).toContain("not a substring");
    });

    it("rejects anchor.exact shorter than 3 characters with 422 Validation Error", async () => {
      mockActorId = commenterId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${version1Id}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "COMMENT",
            anchor: {
              exact: "Tw",
              prefix: "",
              suffix: "",
            },
            text: "Short quote test",
          }),
        }
      );

      const res = await createAnnotationRoute(req, {
        params: Promise.resolve({ id: version1Id }),
      });
      expect(res.status).toBe(422);
    });

    it("allows commenter to create COMMENT and QUESTION annotations with initial USER message", async () => {
      mockActorId = commenterId;

      // 1. Create a COMMENT
      const commentReq = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${version1Id}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "COMMENT",
            anchor: {
              exact: "Two-phase commit",
              prefix: "",
              suffix: " is an atomic",
              start: 0,
              end: 16,
            },
            text: "Also known as 2PC protocol.",
          }),
        }
      );

      const commentRes = await createAnnotationRoute(commentReq, {
        params: Promise.resolve({ id: version1Id }),
      });
      expect(commentRes.status).toBe(200);
      const commentJson = await commentRes.json();
      expect(commentJson.data.kind).toBe("COMMENT");
      expect(commentJson.data.visibility).toBe("PRIVATE");
      expect(commentJson.data.questionState).toBe("NONE");
      expect(commentJson.data.anchorExact).toBe("Two-phase commit");
      expect(commentJson.data.messages).toHaveLength(1);
      expect(commentJson.data.messages[0].role).toBe("USER");
      expect(commentJson.data.messages[0].content).toBe("Also known as 2PC protocol.");
      expect(commentJson.data.messages[0].authorId).toBe(commenterId);

      // 2. Create a QUESTION (initial state QUEUED)
      const questionReq = new NextRequest(
        `http://localhost:3000/api/v1/response-versions/${version1Id}/annotations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "ASK",
            anchor: {
              exact: "atomic commitment protocol",
              prefix: "is an ",
              suffix: " for distributed",
            },
            text: "What failure modes can block 2PC?",
          }),
        }
      );

      const questionRes = await createAnnotationRoute(questionReq, {
        params: Promise.resolve({ id: version1Id }),
      });
      expect(questionRes.status).toBe(200);
      const questionJson = await questionRes.json();
      expect(questionJson.data.kind).toBe("ASK");
      expect(questionJson.data.questionState).toBe("QUEUED");
      expect(questionJson.data.messages[0].content).toBe("What failure modes can block 2PC?");
    });

    it("verifies role matrix: commenter has comment but NOT ask / generate", () => {
      expect(can("COMMENTER", "workspace.comment")).toBe(true);
      expect(can("COMMENTER", "workspace.ask")).toBe(false);
      expect(can("COMMENTER", "workspace.generate")).toBe(false);

      expect(can("VIEWER", "workspace.comment")).toBe(false);
      expect(can("VIEWER", "workspace.ask")).toBe(false);
      expect(can("VIEWER", "workspace.generate")).toBe(false);

      expect(can("EDITOR", "workspace.comment")).toBe(true);
      expect(can("EDITOR", "workspace.ask")).toBe(true);
      expect(can("EDITOR", "workspace.generate")).toBe(true);

      expect(can("ADMIN", "workspace.comment")).toBe(true);
      expect(can("ADMIN", "workspace.ask")).toBe(true);
      expect(can("ADMIN", "workspace.generate")).toBe(true);

      expect(can("OWNER", "workspace.comment")).toBe(true);
      expect(can("OWNER", "workspace.ask")).toBe(true);
      expect(can("OWNER", "workspace.generate")).toBe(true);
    });
  });

  describe("2. Listing & Privacy: GET /api/v1/responses/:id/annotations", () => {
    let commenterPrivateAnnotId: string;
    let commenterWorkspaceAnnotId: string;
    let v2AnnotId: string;

    beforeAll(async () => {
      // Create commenter private annotation on v1
      const a1 = await db.annotation.create({
        data: {
          workspaceId,
          responseId,
          versionId: version1Id,
          createdById: commenterId,
          kind: "COMMENT",
          visibility: "PRIVATE",
          anchorExact: "commit or abort",
          anchorPrefix: "either ",
          anchorSuffix: " the transaction.",
          messages: {
            create: [{ role: "USER", content: "Private note by commenter", authorId: commenterId }],
          },
        },
      });
      commenterPrivateAnnotId = a1.id;

      // Create commenter workspace-visible annotation on v1
      const a2 = await db.annotation.create({
        data: {
          workspaceId,
          responseId,
          versionId: version1Id,
          createdById: commenterId,
          kind: "COMMENT",
          visibility: "WORKSPACE",
          anchorExact: "all nodes",
          anchorPrefix: "guarantees that ",
          anchorSuffix: " either commit",
          messages: {
            create: [{ role: "USER", content: "Team note visible to all", authorId: commenterId }],
          },
        },
      });
      commenterWorkspaceAnnotId = a2.id;

      // Create editor annotation on v2
      const a3 = await db.annotation.create({
        data: {
          workspaceId,
          responseId,
          versionId: version2Id,
          createdById: editorId,
          kind: "ASK",
          visibility: "WORKSPACE",
          anchorExact: "consensus algorithm",
          anchorPrefix: "Raft is a ",
          anchorSuffix: " designed as",
          messages: {
            create: [{ role: "USER", content: "How does leader election work?", authorId: editorId }],
          },
        },
      });
      v2AnnotId = a3.id;
    });

    it("user B (viewer/editor) CANNOT see commenter's PRIVATE annotation in listing", async () => {
      mockActorId = viewerId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/responses/${responseId}/annotations?versionId=${version1Id}`
      );
      const res = await getAnnotationsRoute(req, {
        params: Promise.resolve({ id: responseId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      const ids = json.data.map((a: { id: string }) => a.id);

      expect(ids).toContain(commenterWorkspaceAnnotId);
      expect(ids).not.toContain(commenterPrivateAnnotId);
    });

    it("commenter CAN see their own PRIVATE annotations in listing", async () => {
      mockActorId = commenterId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/responses/${responseId}/annotations?versionId=${version1Id}`
      );
      const res = await getAnnotationsRoute(req, {
        params: Promise.resolve({ id: responseId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      const ids = json.data.map((a: { id: string }) => a.id);

      expect(ids).toContain(commenterPrivateAnnotId);
      expect(ids).toContain(commenterWorkspaceAnnotId);
    });

    it("filters annotations accurately by versionId query parameter", async () => {
      mockActorId = editorId;
      const reqV2 = new NextRequest(
        `http://localhost:3000/api/v1/responses/${responseId}/annotations?versionId=${version2Id}`
      );
      const resV2 = await getAnnotationsRoute(reqV2, {
        params: Promise.resolve({ id: responseId }),
      });
      const jsonV2 = await resV2.json();
      const idsV2 = jsonV2.data.map((a: { id: string }) => a.id);

      expect(idsV2).toContain(v2AnnotId);
      expect(idsV2).not.toContain(commenterWorkspaceAnnotId);
    });

    it("direct GET /api/v1/annotations/:id returns 404 when user B accesses user A's PRIVATE annotation", async () => {
      mockActorId = editorId; // editor is not creator of commenterPrivateAnnotId
      const req = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${commenterPrivateAnnotId}`
      );
      const res = await getAnnotationRoute(req, {
        params: Promise.resolve({ id: commenterPrivateAnnotId }),
      });
      expect(res.status).toBe(404);
    });

    it("direct GET /api/v1/annotations/:id returns 200 when creator accesses their own PRIVATE annotation", async () => {
      mockActorId = commenterId;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${commenterPrivateAnnotId}`
      );
      const res = await getAnnotationRoute(req, {
        params: Promise.resolve({ id: commenterPrivateAnnotId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe(commenterPrivateAnnotId);
      expect(json.data.anchorExact).toBe("commit or abort");
    });
  });

  describe("3. Update & Permissions: PATCH /api/v1/annotations/:id", () => {
    let testAnnotId: string;

    beforeEach(async () => {
      const a = await db.annotation.create({
        data: {
          workspaceId,
          responseId,
          versionId: version1Id,
          createdById: commenterId,
          kind: "COMMENT",
          visibility: "PRIVATE",
          anchorExact: "distributed systems",
          anchorPrefix: "protocol for ",
          anchorSuffix: ". It guarantees",
          messages: {
            create: [{ role: "USER", content: "Original message text", authorId: commenterId }],
          },
        },
      });
      testAnnotId = a.id;
    });

    it("allows creator to edit message text, resolve status, and update visibility", async () => {
      mockActorId = commenterId;

      const patchReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: "Updated text: verified in Leslie Lamport paper",
            resolved: true,
            visibility: "WORKSPACE",
          }),
        }
      );

      const patchRes = await updateAnnotationRoute(patchReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(patchRes.status).toBe(200);
      const json = await patchRes.json();
      expect(json.data.visibility).toBe("WORKSPACE");
      expect(json.data.resolvedAt).not.toBeNull();
      expect(json.data.messages[0].content).toBe(
        "Updated text: verified in Leslie Lamport paper"
      );
    });

    it("blocks non-creator non-admin from modifying WORKSPACE annotation with 403 Forbidden", async () => {
      // First switch visibility to WORKSPACE
      await db.annotation.update({
        where: { id: testAnnotId },
        data: { visibility: "WORKSPACE" },
      });

      mockActorId = viewerId; // viewer is not creator or admin
      const patchReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resolved: true,
          }),
        }
      );

      const patchRes = await updateAnnotationRoute(patchReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(patchRes.status).toBe(403);
    });

    it("allows workspace admin to resolve or change visibility of WORKSPACE annotations", async () => {
      // Visibility is WORKSPACE
      await db.annotation.update({
        where: { id: testAnnotId },
        data: { visibility: "WORKSPACE" },
      });

      mockActorId = adminId;
      const patchReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            resolved: true,
          }),
        }
      );

      const patchRes = await updateAnnotationRoute(patchReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(patchRes.status).toBe(200);
      const json = await patchRes.json();
      expect(json.data.resolvedAt).not.toBeNull();
    });
  });

  describe("4. Delete & Soft Delete: DELETE /api/v1/annotations/:id", () => {
    let testAnnotId: string;

    beforeEach(async () => {
      const a = await db.annotation.create({
        data: {
          workspaceId,
          responseId,
          versionId: version1Id,
          createdById: commenterId,
          kind: "COMMENT",
          visibility: "WORKSPACE",
          anchorExact: "atomic commitment",
          anchorPrefix: "an ",
          anchorSuffix: " protocol",
          messages: {
            create: [{ role: "USER", content: "To be deleted", authorId: commenterId }],
          },
        },
      });
      testAnnotId = a.id;
    });

    it("blocks non-creator non-admin from deleting with 403 Forbidden", async () => {
      mockActorId = editorId; // editor is not creator or admin
      const delReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`,
        { method: "DELETE" }
      );
      const delRes = await deleteAnnotationRoute(delReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(delRes.status).toBe(403);
    });

    it("allows creator to soft-delete; annotation disappears from listings and direct queries", async () => {
      mockActorId = commenterId;
      const delReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`,
        { method: "DELETE" }
      );
      const delRes = await deleteAnnotationRoute(delReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(delRes.status).toBe(200);

      // Verify row is soft deleted in DB
      const dbRow = await db.annotation.findUnique({ where: { id: testAnnotId } });
      expect(dbRow?.deletedAt).not.toBeNull();

      // Verify direct GET returns 404
      const getReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`
      );
      const getRes = await getAnnotationRoute(getReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(getRes.status).toBe(404);

      // Verify listing excludes soft-deleted annotation
      const listReq = new NextRequest(
        `http://localhost:3000/api/v1/responses/${responseId}/annotations`
      );
      const listRes = await getAnnotationsRoute(listReq, {
        params: Promise.resolve({ id: responseId }),
      });
      const listJson = await listRes.json();
      const ids = listJson.data.map((a: { id: string }) => a.id);
      expect(ids).not.toContain(testAnnotId);
    });

    it("allows workspace admin to soft-delete a WORKSPACE annotation", async () => {
      mockActorId = adminId;
      const delReq = new NextRequest(
        `http://localhost:3000/api/v1/annotations/${testAnnotId}`,
        { method: "DELETE" }
      );
      const delRes = await deleteAnnotationRoute(delReq, {
        params: Promise.resolve({ id: testAnnotId }),
      });
      expect(delRes.status).toBe(200);

      const dbRow = await db.annotation.findUnique({ where: { id: testAnnotId } });
      expect(dbRow?.deletedAt).not.toBeNull();
    });
  });
});
