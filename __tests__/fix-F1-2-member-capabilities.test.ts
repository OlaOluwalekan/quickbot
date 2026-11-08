/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { resolveWorkspaceRole, requireWorkspace } from "@/server/authz/access";
import {
  updateWorkspaceMemberRole,
  updateProjectMemberRole,
  listWorkspaceMembers,
} from "@/server/services/members";
import {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from "@/server/services/annotation";
import { PATCH as memberPatchRoute } from "@/app/api/v1/workspaces/[id]/members/[userId]/route";

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));

describe("Fix F1.2 — Member capabilities (Comment and Ask)", () => {
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    owner: `f12_o_${sfx}`,
    commenterWithAsk: `f12_ca_${sfx}`,
    editorWithoutAsk: `f12_enoa_${sfx}`,
    projMember: `f12_pm_${sfx}`,
    adminMember: `f12_adm_${sfx}`,
    suspendedMember: `f12_susp_${sfx}`,
    demotedAdmin: `f12_dadm_${sfx}`,
    projEditorNoAsk: `f12_pena_${sfx}`,
    suspendedAdmin: `f12_sadm_${sfx}`,
    revokedCommenter: `f12_rc_${sfx}`,
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
  let responseId = "";
  let versionId = "";

  async function cleanup() {
    await db.annotationMessage.deleteMany({ where: { authorId: { in: allIds } } });
    await db.annotation.deleteMany({ where: { createdById: { in: allIds } } });
    await db.responseVersion.deleteMany({
      where: { response: { workspace: { ownerId: ids.owner } } },
    });
    await db.response.deleteMany({
      where: { workspace: { ownerId: ids.owner } },
    });
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

    const project = await db.project.create({
      data: {
        name: "Capability Project",
        ownerId: ids.owner,
      },
    });
    projectId = project.id;

    const ws1 = await db.workspace.create({
      data: {
        title: "Workspace 1",
        ownerId: ids.owner,
        projectId,
      },
    });
    workspace1Id = ws1.id;

    const ws2 = await db.workspace.create({
      data: {
        title: "Workspace 2",
        ownerId: ids.owner,
        projectId,
      },
    });
    workspace2Id = ws2.id;

    const resp = await db.response.create({
      data: {
        workspaceId: workspace1Id,
        prompt: "Explain consensus protocols",
        createdById: ids.owner,
      },
    });
    responseId = resp.id;

    const ver = await db.responseVersion.create({
      data: {
        responseId: resp.id,
        number: 1,
        content: "Raft and Paxos ensure consistency across distributed nodes.",
        status: "COMPLETE",
        modelKey: "text-standard",
        providerModelId: "gemini-2.5-flash",
        promptVersion: "v1",
        createdById: ids.owner,
      },
    });
    versionId = ver.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("1. A Commenter with canAsk = true can Ask but gets 403 on workspace.generate (main prompt)", async () => {
    // Add member as COMMENTER with canAsk = true
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.commenterWithAsk,
        role: "COMMENTER",
        canAsk: true,
        invitedById: ids.owner,
      },
    });

    // Check capabilities directly
    const access = await resolveWorkspaceRole(ids.commenterWithAsk, workspace1Id);
    expect(access).not.toBeNull();
    expect(access?.capabilities.has("workspace.comment")).toBe(true);
    expect(access?.capabilities.has("workspace.ask")).toBe(true);
    expect(access?.capabilities.has("workspace.generate")).toBe(false);

    // Can create an Ask question
    await expect(
      createAnnotation(actorFor("commenterWithAsk"), versionId, {
        kind: "QUESTION",
        text: "How does leader election work?",
        anchor: {
          exact: "Raft and Paxos",
          prefix: "",
          suffix: " ensure consistency",
        },
        contentSource: "ORIGINAL",
      })
    ).resolves.toMatchObject({
      kind: "QUESTION",
    });

    // But gets 403 on workspace.generate
    await expect(
      requireWorkspace(actorFor("commenterWithAsk"), workspace1Id, "workspace.generate")
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("2. An Editor with canAsk = false gets 403 on Ask but can prompt (workspace.generate)", async () => {
    // Add member as EDITOR with canAsk = false
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.editorWithoutAsk,
        role: "EDITOR",
        canAsk: false,
        invitedById: ids.owner,
      },
    });

    const access = await resolveWorkspaceRole(ids.editorWithoutAsk, workspace1Id);
    expect(access).not.toBeNull();
    expect(access?.capabilities.has("workspace.comment")).toBe(true);
    expect(access?.capabilities.has("workspace.ask")).toBe(false);
    expect(access?.capabilities.has("workspace.generate")).toBe(true);

    // Can prompt (workspace.generate succeeds)
    await expect(
      requireWorkspace(actorFor("editorWithoutAsk"), workspace1Id, "workspace.generate")
    ).resolves.toMatchObject({
      role: "EDITOR",
    });

    // Cannot Ask (gets 403)
    await expect(
      createAnnotation(actorFor("editorWithoutAsk"), versionId, {
        kind: "QUESTION",
        text: "Can I ask a question?",
        anchor: {
          exact: "Raft and Paxos",
          prefix: "",
          suffix: " ensure consistency",
        },
        contentSource: "ORIGINAL",
      })
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("3. A project-level canAsk = true applies to all project workspaces", async () => {
    // Add member to project as VIEWER with canAsk = true
    await db.projectMember.create({
      data: {
        projectId,
        userId: ids.projMember,
        role: "VIEWER",
        canAsk: true,
        invitedById: ids.owner,
      },
    });

    // Even with no workspace member row, canAsk inherits to both workspace 1 and workspace 2
    const ws1Access = await resolveWorkspaceRole(ids.projMember, workspace1Id);
    expect(ws1Access?.capabilities.has("workspace.ask")).toBe(true);

    const ws2Access = await resolveWorkspaceRole(ids.projMember, workspace2Id);
    expect(ws2Access?.capabilities.has("workspace.ask")).toBe(true);

    // Workspace-level explicit row with canAsk = false cannot remove the project-level grant
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.projMember,
        role: "VIEWER",
        canAsk: false,
        invitedById: ids.owner,
      },
    });

    const ws1After = await resolveWorkspaceRole(ids.projMember, workspace1Id);
    expect(ws1After?.capabilities.has("workspace.ask")).toBe(true);
  });

  it("4. ADMIN rows reject toggles with 422", async () => {
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.adminMember,
        role: "ADMIN",
        invitedById: ids.owner,
      },
    });

    // Direct service call rejects with 422 unprocessable
    await expect(
      updateWorkspaceMemberRole(actorFor("owner"), workspace1Id, ids.adminMember, {
        canAsk: false,
      })
    ).rejects.toMatchObject({
      status: 422,
      code: "admin_toggles_not_allowed",
    });

    // HTTP PATCH route rejects with 422
    mockActor = actorFor("owner");
    const req = new NextRequest(
      `http://localhost:3000/api/v1/workspaces/${workspace1Id}/members/${ids.adminMember}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canComment: false }),
      }
    );
    const res = await memberPatchRoute(req, {
      params: Promise.resolve({ id: workspace1Id, userId: ids.adminMember }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error?.code).toBe("admin_toggles_not_allowed");
  });

  it("5. Suspended members get 403 on comment/ask/generate but 200 on read", async () => {
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.suspendedMember,
        role: "EDITOR",
        suspendedAt: new Date(),
        suspendedReason: "PLAN_LIMIT",
        invitedById: ids.owner,
      },
    });

    const access = await resolveWorkspaceRole(ids.suspendedMember, workspace1Id);
    expect(access).not.toBeNull();
    expect(access?.capabilities.has("workspace.read")).toBe(true);
    expect(access?.capabilities.has("workspace.comment")).toBe(false);
    expect(access?.capabilities.has("workspace.ask")).toBe(false);
    expect(access?.capabilities.has("workspace.generate")).toBe(false);

    // Read succeeds
    await expect(
      requireWorkspace(actorFor("suspendedMember"), workspace1Id, "workspace.read")
    ).resolves.toMatchObject({
      // A suspended row also contributes only VIEWER to the effective role.
      role: "VIEWER",
    });

    // Comment, Ask, Generate all reject with 403
    await expect(
      requireWorkspace(actorFor("suspendedMember"), workspace1Id, "workspace.comment")
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      requireWorkspace(actorFor("suspendedMember"), workspace1Id, "workspace.ask")
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      requireWorkspace(actorFor("suspendedMember"), workspace1Id, "workspace.generate")
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("6. Demoting an Admin and setting toggles in one request is allowed", async () => {
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.demotedAdmin,
        role: "ADMIN",
        invitedById: ids.owner,
      },
    });

    const { member } = await updateWorkspaceMemberRole(
      actorFor("owner"),
      workspace1Id,
      ids.demotedAdmin,
      { role: "EDITOR", canAsk: false }
    );
    expect(member).toMatchObject({ role: "EDITOR", canAsk: false });

    const access = await resolveWorkspaceRole(ids.demotedAdmin, workspace1Id);
    expect(access?.capabilities.has("workspace.ask")).toBe(false);
    expect(access?.capabilities.has("workspace.generate")).toBe(true);
  });

  it("7. Member list reports inherited/effective capabilities including project-level overrides", async () => {
    await db.projectMember.create({
      data: {
        projectId,
        userId: ids.projEditorNoAsk,
        role: "EDITOR",
        canAsk: false,
        invitedById: ids.owner,
      },
    });

    const { members } = await listWorkspaceMembers(actorFor("owner"), workspace2Id);
    expect(members.find((m) => m.userId === ids.projEditorNoAsk)).toMatchObject({
      inheritedCanComment: true,
      inheritedCanAsk: false, // the project row turned Ask off: not a locked "on"
      effectiveCanComment: true,
      effectiveCanAsk: false,
    });

    // A workspace row can add Ask on top of the project grant.
    await updateWorkspaceMemberRole(actorFor("owner"), workspace2Id, ids.projEditorNoAsk, {
      canAsk: true,
    });
    const after = await listWorkspaceMembers(actorFor("owner"), workspace2Id);
    expect(after.members.find((m) => m.userId === ids.projEditorNoAsk)).toMatchObject({
      source: "BOTH",
      inheritedCanAsk: false,
      canAsk: true,
      effectiveCanAsk: true,
    });
    const access = await resolveWorkspaceRole(ids.projEditorNoAsk, workspace2Id);
    expect(access?.capabilities.has("workspace.ask")).toBe(true);
  });

  it("8. A suspended Admin loses role-based moderation rights", async () => {
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace2Id,
        userId: ids.suspendedAdmin,
        role: "ADMIN",
        suspendedAt: new Date(),
        suspendedReason: "PLAN_LIMIT",
        invitedById: ids.owner,
      },
    });
    const access = await resolveWorkspaceRole(ids.suspendedAdmin, workspace2Id);
    expect(access?.role).toBe("VIEWER");
    expect([...(access?.capabilities ?? [])]).toEqual(["workspace.read"]);
  });

  it("9. Turning Comment off stops the creator editing or deleting their comment; the owner still can", async () => {
    await db.workspaceMember.create({
      data: {
        workspaceId: workspace1Id,
        userId: ids.revokedCommenter,
        role: "COMMENTER",
        invitedById: ids.owner,
      },
    });
    const annot = await createAnnotation(actorFor("revokedCommenter"), versionId, {
      kind: "COMMENT",
      text: "Worth a citation",
      anchor: { exact: "Raft and Paxos", prefix: "", suffix: " ensure consistency" },
      contentSource: "ORIGINAL",
    });

    // While allowed, the creator can edit (and shares it so the owner sees it).
    await expect(
      updateAnnotation(actorFor("revokedCommenter"), annot.id, {
        text: "Needs a citation",
        visibility: "WORKSPACE",
      })
    ).resolves.toBeTruthy();

    await updateWorkspaceMemberRole(actorFor("owner"), workspace1Id, ids.revokedCommenter, {
      canComment: false,
    });

    await expect(
      updateAnnotation(actorFor("revokedCommenter"), annot.id, { resolved: true })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteAnnotation(actorFor("revokedCommenter"), annot.id)
    ).rejects.toMatchObject({ status: 403 });

    // Moderation by the owner is unaffected.
    await expect(deleteAnnotation(actorFor("owner"), annot.id)).resolves.toEqual({
      success: true,
    });
  });
});
