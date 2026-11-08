/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { resolveWorkspaceRole, requireWorkspace, requireProject } from "@/server/authz/access";
import {
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
  removeProjectMember,
  removeWorkspaceMember,
} from "@/server/services/members";
import { PATCH as memberPatchRoute } from "@/app/api/v1/workspaces/[id]/members/[userId]/route";

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));

describe("Fix F1.1 — Top-down permission inheritance", () => {
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    projOwner: `f1_po_${sfx}`,
    wsOwner: `f1_wo_${sfx}`,
    memberA: `f1_ma_${sfx}`,
    memberB: `f1_mb_${sfx}`,
    memberC: `f1_mc_${sfx}`,
    wsOnlyMember: `f1_wsonly_${sfx}`,
  };
  const allIds = Object.values(ids);
  const email = (k: keyof typeof ids) => `${k}_${sfx}@example.com`;
  const actorFor = (k: keyof typeof ids): Actor => ({
    userId: ids[k],
    role: "USER",
    sessionId: `sess_${k}_${sfx}`,
    email: email(k),
    name: k,
  });

  let projectId = "";
  let workspace1Id = "";
  let workspace2Id = "";

  async function cleanup() {
    await db.activityLog.deleteMany({ where: { actorId: { in: allIds } } });
    await db.invitation.deleteMany({ where: { invitedById: { in: allIds } } });
    await db.workspaceMember.deleteMany({ where: { userId: { in: allIds } } });
    await db.projectMember.deleteMany({ where: { userId: { in: allIds } } });
    await db.workspace.deleteMany({ where: { ownerId: { in: allIds } } });
    await db.project.deleteMany({ where: { ownerId: { in: allIds } } });
    await db.user.deleteMany({ where: { id: { in: allIds } } });
  }

  beforeAll(async () => {
    await cleanup();
    await db.user.createMany({
      data: (Object.keys(ids) as Array<keyof typeof ids>).map((k) => ({
        id: ids[k],
        email: email(k),
        name: k,
        emailVerified: true,
        username: `${k}${sfx}`.toLowerCase(),
        displayUsername: `${k}${sfx}`.toLowerCase(),
      })),
    });

    // Create a project owned by projOwner
    const project = await db.project.create({
      data: {
        name: "Inheritance Project",
        ownerId: ids.projOwner,
      },
    });
    projectId = project.id;

    // Create workspace 1 in the project, owned by wsOwner (NOT projOwner)
    const ws1 = await db.workspace.create({
      data: {
        title: "Workspace 1 (owned by wsOwner)",
        ownerId: ids.wsOwner,
        projectId,
      },
    });
    workspace1Id = ws1.id;

    // Create workspace 2 in the same project, owned by projOwner
    const ws2 = await db.workspace.create({
      data: {
        title: "Workspace 2 (owned by projOwner)",
        ownerId: ids.projOwner,
        projectId,
      },
    });
    workspace2Id = ws2.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  // Table-driven tests covering the required 5 cases:
  describe("Core permission inheritance table-driven tests", () => {
    it("Case 1: project VIEWER + workspace EDITOR → effective role is EDITOR", async () => {
      // memberA: Project role VIEWER, Workspace role EDITOR
      await db.projectMember.create({
        data: {
          projectId,
          userId: ids.memberA,
          role: "VIEWER",
          invitedById: ids.projOwner,
        },
      });
      await db.workspaceMember.create({
        data: {
          workspaceId: workspace1Id,
          userId: ids.memberA,
          role: "EDITOR",
          invitedById: ids.wsOwner,
        },
      });

      const access = await resolveWorkspaceRole(ids.memberA, workspace1Id);
      expect(access).not.toBeNull();
      expect(access?.role).toBe("EDITOR");

      // Verify listWorkspaceMembers returns BOTH with inheritedRole VIEWER and role EDITOR
      const membersResult = await listWorkspaceMembers(actorFor("wsOwner"), workspace1Id);
      const memberItem = membersResult.members.find((m) => m.userId === ids.memberA);
      expect(memberItem).toBeDefined();
      expect(memberItem?.source).toBe("BOTH");
      expect(memberItem?.role).toBe("EDITOR");
      expect(memberItem?.inheritedRole).toBe("VIEWER");
    });

    it("Case 2: project EDITOR + workspace VIEWER → effective role is EDITOR, and PATCH trying it gets 409 role_below_inherited", async () => {
      // memberB: Project role EDITOR
      await db.projectMember.create({
        data: {
          projectId,
          userId: ids.memberB,
          role: "EDITOR",
          invitedById: ids.projOwner,
        },
      });

      // Direct service call to try demoting below inherited role rejects with 409
      await expect(
        updateWorkspaceMemberRole(actorFor("wsOwner"), workspace1Id, ids.memberB, "VIEWER")
      ).rejects.toMatchObject({
        status: 409,
        code: "role_below_inherited",
      });

      // HTTP PATCH route trying to set role to VIEWER returns 409
      mockActor = actorFor("wsOwner");
      const req = new NextRequest(`http://localhost:3000/api/v1/workspaces/${workspace1Id}/members/${ids.memberB}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "VIEWER" }),
      });
      const patchRes = await memberPatchRoute(req, {
        params: Promise.resolve({ id: workspace1Id, userId: ids.memberB }),
      });
      expect(patchRes.status).toBe(409);
      const patchJson = await patchRes.json();
      expect(patchJson.error?.code).toBe("role_below_inherited");

      // If an existing workspace row had VIEWER (e.g. from prior state), maxRole still resolves to EDITOR
      // Create explicit VIEWER row directly in DB to verify maxRole calculation
      await db.workspaceMember.create({
        data: {
          workspaceId: workspace1Id,
          userId: ids.memberB,
          role: "VIEWER",
          invitedById: ids.wsOwner,
        },
      });
      const access = await resolveWorkspaceRole(ids.memberB, workspace1Id);
      expect(access?.role).toBe("EDITOR");
    });

    it("Case 3: project owner → ADMIN on a workspace owned by someone else in their project", async () => {
      // Workspace1 is owned by wsOwner, but sits inside Project owned by projOwner
      const access = await resolveWorkspaceRole(ids.projOwner, workspace1Id);
      expect(access).not.toBeNull();
      expect(access?.role).toBe("ADMIN");

      // Can perform admin actions on the workspace
      const reqAccess = await requireWorkspace(actorFor("projOwner"), workspace1Id, "workspace.manage_members");
      expect(reqAccess.role).toBe("ADMIN");

      // Project owner shows up in listWorkspaceMembers as inherited ADMIN from PROJECT
      const membersResult = await listWorkspaceMembers(actorFor("wsOwner"), workspace1Id);
      const projOwnerItem = membersResult.members.find((m) => m.userId === ids.projOwner);
      expect(projOwnerItem).toBeDefined();
      expect(projOwnerItem?.role).toBe("ADMIN");
      expect(projOwnerItem?.inheritedRole).toBe("ADMIN");
      expect(projOwnerItem?.source).toBe("PROJECT");
    });

    it("Case 4: workspace-only member has no access to the project or its other workspaces (404)", async () => {
      // wsOnlyMember is granted EDITOR only on workspace 1
      await db.workspaceMember.create({
        data: {
          workspaceId: workspace1Id,
          userId: ids.wsOnlyMember,
          role: "EDITOR",
          invitedById: ids.wsOwner,
        },
      });

      // Has access to workspace 1
      const ws1Access = await resolveWorkspaceRole(ids.wsOnlyMember, workspace1Id);
      expect(ws1Access?.role).toBe("EDITOR");

      // Has NO access to the project (throws 404)
      await expect(
        requireProject(actorFor("wsOnlyMember"), projectId, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });

      // Has NO access to other workspaces in the project (workspace 2)
      const ws2Access = await resolveWorkspaceRole(ids.wsOnlyMember, workspace2Id);
      expect(ws2Access).toBeNull();

      await expect(
        requireWorkspace(actorFor("wsOnlyMember"), workspace2Id, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("Case 5: a member removed from the project loses access immediately", async () => {
      // memberC is added to project as EDITOR
      await db.projectMember.create({
        data: {
          projectId,
          userId: ids.memberC,
          role: "EDITOR",
          invitedById: ids.projOwner,
        },
      });

      // Initially has inherited access on workspace 1
      let ws1Access = await resolveWorkspaceRole(ids.memberC, workspace1Id);
      expect(ws1Access?.role).toBe("EDITOR");

      // Attempting to remove from workspace when access is only inherited rejects with 400
      await expect(
        removeWorkspaceMember(actorFor("wsOwner"), workspace1Id, ids.memberC)
      ).rejects.toMatchObject({
        status: 400,
      });

      // Remove memberC from the project
      await removeProjectMember(actorFor("projOwner"), projectId, ids.memberC);

      // Access to workspace 1 is immediately lost (returns null / throws 404)
      ws1Access = await resolveWorkspaceRole(ids.memberC, workspace1Id);
      expect(ws1Access).toBeNull();

      await expect(
        requireWorkspace(actorFor("memberC"), workspace1Id, "workspace.read")
      ).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });
  });
});
