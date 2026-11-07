/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  resendInvitation,
  getInvitationInfoByToken,
  acceptInvitation,
  hashInviteToken,
} from "@/server/services/invitation";
import {
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  removeProjectMember,
  transferWorkspaceOwnership,
  transferProjectOwnership,
} from "@/server/services/members";
import { listWorkspaceActivity } from "@/server/services/activity";
import { resolveWorkspaceRole } from "@/server/authz/access";
import { POST as acceptRoute } from "@/app/api/v1/invitations/accept/route";

const sentEmails: Array<{ to: string; data: { inviteUrl?: string } }> = [];

jest.mock("../server/email/send", () => ({
  sendEmail: jest.fn(async (_tpl: string, to: string, data: { inviteUrl?: string }) => {
    sentEmails.push({ to, data });
    return { ok: true };
  }),
  maskEmail: (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2"),
}));

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));

function tokenFromLastEmail(): string {
  const url = sentEmails.at(-1)?.data.inviteUrl ?? "";
  return url.split("/invite/")[1] ?? "";
}

describe("Step 7.4 — Members and invitations", () => {
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    owner: `u74_owner_${sfx}`,
    admin: `u74_admin_${sfx}`,
    editor: `u74_editor_${sfx}`,
    viewer: `u74_viewer_${sfx}`,
    invitee: `u74_inv_${sfx}`,
    unverified: `u74_unv_${sfx}`,
    stranger: `u74_str_${sfx}`,
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

  let workspaceId = "";
  let projectId = "";
  let projectWorkspaceId = "";

  async function cleanup() {
    await db.activityLog.deleteMany({ where: { actorId: { in: allIds } } });
    await db.invitation.deleteMany({ where: { invitedById: { in: allIds } } });
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
        emailVerified: k !== "unverified",
        username: `${k}${sfx}`.toLowerCase(),
        displayUsername: `${k}${sfx}`.toLowerCase(),
      })),
    });

    const ws = await db.workspace.create({
      data: { ownerId: ids.owner, title: "Team WS" },
    });
    workspaceId = ws.id;
    await db.workspaceMember.createMany({
      data: [
        { workspaceId, userId: ids.admin, role: "ADMIN", invitedById: ids.owner },
        { workspaceId, userId: ids.editor, role: "EDITOR", invitedById: ids.owner },
        { workspaceId, userId: ids.viewer, role: "VIEWER", invitedById: ids.owner },
      ],
    });

    const project = await db.project.create({
      data: { ownerId: ids.owner, name: "Team Project" },
    });
    projectId = project.id;
    const pws = await db.workspace.create({
      data: { ownerId: ids.owner, title: "Project WS", projectId },
    });
    projectWorkspaceId = pws.id;
  });

  beforeEach(() => {
    sentEmails.length = 0;
    clearUserPlanOverrides();
    setUserPlanOverride(ids.owner, "PRO");
  });

  afterAll(async () => {
    clearUserPlanOverrides();
    await cleanup();
  });

  // ---------------- Permission matrix ----------------
  describe("invite permission matrix", () => {
    it("viewer and editor cannot invite (403)", async () => {
      for (const k of ["viewer", "editor"] as const) {
        await expect(
          createInvitation(actorFor(k), { workspaceId, emailOrUsername: "x@example.com", role: "VIEWER" })
        ).rejects.toMatchObject({ status: 403 });
      }
    });

    it("non-member gets 404 (no existence leak)", async () => {
      await expect(
        createInvitation(actorFor("stranger"), { workspaceId, emailOrUsername: "x@example.com", role: "VIEWER" })
      ).rejects.toMatchObject({ status: 404 });
    });

    it("admin can invite but cannot invite an Admin", async () => {
      await expect(
        createInvitation(actorFor("admin"), { workspaceId, emailOrUsername: `adm_${sfx}@example.com`, role: "VIEWER" })
      ).resolves.toMatchObject({ success: true });
      await expect(
        createInvitation(actorFor("admin"), { workspaceId, emailOrUsername: `adm2_${sfx}@example.com`, role: "ADMIN" })
      ).rejects.toMatchObject({ status: 403 });
    });

    it("rejects invalid roles including NONE and OWNER", async () => {
      for (const role of ["NONE", "OWNER", "SUPERUSER"]) {
        await expect(
          createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: `r_${sfx}@example.com`, role })
        ).rejects.toMatchObject({ status: 400 });
      }
    });
  });

  // ---------------- Invitation lifecycle ----------------
  describe("invitation lifecycle", () => {
    it("stores only a SHA-256 hash of a 32-byte token and expires in 7 days", async () => {
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: email("invitee"), role: "EDITOR" });
      const raw = tokenFromLastEmail();
      expect(Buffer.from(raw, "base64url")).toHaveLength(32);

      const row = await db.invitation.findFirst({
        where: { workspaceId, email: email("invitee"), status: "PENDING" },
      });
      expect(row).not.toBeNull();
      expect(row!.tokenHash).toBe(hashInviteToken(raw));
      expect(row!.tokenHash).not.toContain(raw);
      const days = (row!.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);
    });

    it("resolves @username to the user's email", async () => {
      await createInvitation(actorFor("owner"), {
        workspaceId,
        emailOrUsername: `@stranger${sfx}`,
        role: "VIEWER",
      });
      expect(sentEmails.at(-1)?.to).toBe(email("stranger"));
    });

    it("unknown username responds generically without sending email", async () => {
      const res = await createInvitation(actorFor("owner"), {
        workspaceId,
        emailOrUsername: "@nobody_here_zz",
        role: "VIEWER",
      });
      expect(res).toEqual({ success: true, message: "Invitation sent" });
      expect(sentEmails).toHaveLength(0);
    });

    it("re-inviting revokes the previous pending invitation", async () => {
      const target = `dup_${sfx}@example.com`;
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: target, role: "VIEWER" });
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: target, role: "EDITOR" });
      const rows = await db.invitation.findMany({ where: { workspaceId, email: target } });
      expect(rows.filter((r) => r.status === "PENDING")).toHaveLength(1);
      expect(rows.filter((r) => r.status === "REVOKED")).toHaveLength(1);
    });

    it("list / resend / revoke", async () => {
      const target = `lrr_${sfx}@example.com`;
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: target, role: "VIEWER" });
      const firstToken = tokenFromLastEmail();
      const list = await listInvitations(actorFor("owner"), { workspaceId });
      const inv = list.find((i) => i.email === target)!;
      expect(inv).toBeDefined();

      await resendInvitation(actorFor("owner"), { workspaceId, invitationId: inv.id });
      const secondToken = tokenFromLastEmail();
      expect(secondToken).not.toBe(firstToken);
      expect((await getInvitationInfoByToken(firstToken)).valid).toBe(false);
      expect((await getInvitationInfoByToken(secondToken)).valid).toBe(true);

      await revokeInvitation(actorFor("owner"), { workspaceId, invitationId: inv.id });
      expect((await getInvitationInfoByToken(secondToken)).valid).toBe(false);
    });

    it("enforces the owner's plan member limit (Free = 0, Lite = 2)", async () => {
      setUserPlanOverride(ids.owner, "FREE");
      await expect(
        createInvitation(actorFor("owner"), { projectId, emailOrUsername: `lim_${sfx}@example.com`, role: "VIEWER" })
      ).rejects.toMatchObject({ status: 403, code: "member_limit_reached" });

      setUserPlanOverride(ids.owner, "LITE");
      await createInvitation(actorFor("owner"), { projectId, emailOrUsername: `lim1_${sfx}@example.com`, role: "VIEWER" });
      await createInvitation(actorFor("owner"), { projectId, emailOrUsername: `lim2_${sfx}@example.com`, role: "VIEWER" });
      await expect(
        createInvitation(actorFor("owner"), { projectId, emailOrUsername: `lim3_${sfx}@example.com`, role: "VIEWER" })
      ).rejects.toMatchObject({ status: 403 });
      await db.invitation.updateMany({ where: { projectId }, data: { status: "REVOKED" } });
    });
  });

  // ---------------- Acceptance ----------------
  describe("acceptance", () => {
    it("rejects mismatched email and unverified accounts", async () => {
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: email("unverified"), role: "VIEWER" });
      const token = tokenFromLastEmail();

      await expect(acceptInvitation(actorFor("stranger"), token)).rejects.toMatchObject({ status: 403 });
      await expect(acceptInvitation(actorFor("unverified"), token)).rejects.toMatchObject({
        status: 403,
        code: "email_not_verified",
      });
    });

    it("accepts once via the route, then the token is single-use", async () => {
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: email("invitee"), role: "COMMENTER" });
      const token = tokenFromLastEmail();

      mockActor = actorFor("invitee");
      const mkReq = () =>
        new NextRequest("http://localhost/api/v1/invitations/accept", {
          method: "POST",
          body: JSON.stringify({ token }),
          headers: { "content-type": "application/json" },
        });
      const res = await acceptRoute(mkReq());
      expect(res.status).toBe(200);
      const role = await resolveWorkspaceRole(ids.invitee, workspaceId);
      expect(role?.role).toBe("COMMENTER");

      const again = await acceptRoute(mkReq());
      expect(again.status).toBe(400);
      mockActor = null;
    });

    it("concurrent accepts only succeed once", async () => {
      await createInvitation(actorFor("owner"), { projectId, emailOrUsername: email("stranger"), role: "VIEWER" });
      const token = tokenFromLastEmail();
      const results = await Promise.allSettled([
        acceptInvitation(actorFor("stranger"), token),
        acceptInvitation(actorFor("stranger"), token),
        acceptInvitation(actorFor("stranger"), token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });

    it("expired invitations are rejected", async () => {
      await createInvitation(actorFor("owner"), { workspaceId, emailOrUsername: `exp_${sfx}@example.com`, role: "VIEWER" });
      const token = tokenFromLastEmail();
      await db.invitation.update({
        where: { tokenHash: hashInviteToken(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const info = await getInvitationInfoByToken(token);
      expect(info.valid).toBe(false);
    });
  });

  // ---------------- Member management ----------------
  describe("member management", () => {
    it("lists owner first plus explicit members", async () => {
      const res = await listWorkspaceMembers(actorFor("viewer"), workspaceId);
      expect(res.owner.userId).toBe(ids.owner);
      expect(res.members.map((m) => m.userId)).toEqual(expect.arrayContaining([ids.admin, ids.editor]));
      expect(res.canManage).toBe(false);
    });

    it("admin cannot change another admin or promote to admin; owner can", async () => {
      await expect(
        updateWorkspaceMemberRole(actorFor("admin"), workspaceId, ids.editor, "ADMIN")
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        updateWorkspaceMemberRole(actorFor("editor"), workspaceId, ids.admin, "VIEWER")
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        updateWorkspaceMemberRole(actorFor("admin"), workspaceId, ids.owner, "VIEWER")
      ).rejects.toMatchObject({ status: 400 });
      await updateWorkspaceMemberRole(actorFor("admin"), workspaceId, ids.viewer, "COMMENTER");
      expect((await resolveWorkspaceRole(ids.viewer, workspaceId))?.role).toBe("COMMENTER");
    });

    it("owner cannot be removed; members can leave; admins cannot remove admins", async () => {
      await expect(removeWorkspaceMember(actorFor("admin"), workspaceId, ids.owner)).rejects.toMatchObject({
        status: 400,
      });
      await db.workspaceMember.create({ data: { workspaceId, userId: ids.unverified, role: "ADMIN", invitedById: ids.owner } });
      await expect(
        removeWorkspaceMember(actorFor("admin"), workspaceId, ids.unverified)
      ).rejects.toMatchObject({ status: 403 });
      await removeWorkspaceMember(actorFor("unverified"), workspaceId, ids.unverified);
      expect(await resolveWorkspaceRole(ids.unverified, workspaceId)).toBeNull();
    });

    it("removing a project member immediately revokes inherited workspace access", async () => {
      await db.projectMember.create({ data: { projectId, userId: ids.editor, role: "EDITOR", invitedById: ids.owner } });
      expect((await resolveWorkspaceRole(ids.editor, projectWorkspaceId))?.role).toBe("EDITOR");
      await removeProjectMember(actorFor("owner"), projectId, ids.editor);
      expect(await resolveWorkspaceRole(ids.editor, projectWorkspaceId)).toBeNull();
    });

    it("removing an inherited member from a project workspace writes NONE", async () => {
      await db.projectMember.create({ data: { projectId, userId: ids.viewer, role: "VIEWER", invitedById: ids.owner } });
      await removeWorkspaceMember(actorFor("owner"), projectWorkspaceId, ids.viewer);
      expect(await resolveWorkspaceRole(ids.viewer, projectWorkspaceId)).toBeNull();
      const row = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: projectWorkspaceId, userId: ids.viewer } },
      });
      expect(row?.role).toBe("NONE");
    });
  });

  // ---------------- Ownership transfer ----------------
  describe("ownership transfer", () => {
    it("requires owner, typed confirmation, and an existing member", async () => {
      await expect(
        transferWorkspaceOwnership(actorFor("admin"), workspaceId, { newOwnerId: ids.editor, confirmation: "TRANSFER" })
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        transferWorkspaceOwnership(actorFor("owner"), workspaceId, { newOwnerId: ids.editor, confirmation: "yes" })
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        transferWorkspaceOwnership(actorFor("owner"), workspaceId, { newOwnerId: ids.stranger, confirmation: "TRANSFER" })
      ).rejects.toMatchObject({ status: 400 });
    });

    it("transfers workspace ownership; previous owner becomes ADMIN; activity recorded", async () => {
      await transferWorkspaceOwnership(actorFor("owner"), workspaceId, {
        newOwnerId: ids.admin,
        confirmation: "Team WS",
      });
      expect((await resolveWorkspaceRole(ids.admin, workspaceId))?.role).toBe("OWNER");
      expect((await resolveWorkspaceRole(ids.owner, workspaceId))?.role).toBe("ADMIN");

      const page = await listWorkspaceActivity(actorFor("admin"), workspaceId, { limit: 50 });
      const actions = page.items.map((i) => i.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          "workspace.ownership_transferred",
          "invitation.created",
          "member.added",
          "member.role_changed",
          "member.removed",
        ])
      );

      // restore for cleanup ownership
      await transferWorkspaceOwnership(actorFor("admin"), workspaceId, {
        newOwnerId: ids.owner,
        confirmation: "TRANSFER",
      });
    });

    it("transfers project ownership to an existing project member", async () => {
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: ids.admin } },
        update: { role: "ADMIN" },
        create: { projectId, userId: ids.admin, role: "ADMIN", invitedById: ids.owner },
      });
      await transferProjectOwnership(actorFor("owner"), projectId, {
        newOwnerId: ids.admin,
        confirmation: "TRANSFER",
      });
      const p = await db.project.findUnique({ where: { id: projectId } });
      expect(p?.ownerId).toBe(ids.admin);
      await transferProjectOwnership(actorFor("admin"), projectId, {
        newOwnerId: ids.owner,
        confirmation: "TRANSFER",
      });
    });
  });
});
