/**
 * @jest-environment node
 *
 * Step 7.7 follow-up: notifications are emitted from the real flows, email
 * follows per-type preferences, invitation links never persist the raw token,
 * and preference updates don't lose concurrent writes.
 */
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import {
  createInvitation,
  resendInvitation,
  getInvitationInfoById,
  acceptInvitationById,
} from "@/server/services/invitation";
import {
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
} from "@/server/services/members";
import {
  notify,
  dismissNotification,
  markNotificationRead,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/server/services/notify";

const sentEmails: Array<{ template: string; to: string; data: Record<string, unknown> }> = [];

jest.mock("../server/email/send", () => ({
  sendEmail: jest.fn(
    async (template: string, to: string, data: Record<string, unknown>) => {
      sentEmails.push({ template, to, data });
      return { success: true };
    }
  ),
  maskEmail: (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2"),
}));

describe("Step 7.7 — notification wiring", () => {
  jest.setTimeout(30000);
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    owner: `u77_owner_${sfx}`,
    member: `u77_member_${sfx}`,
    invitee: `u77_inv_${sfx}`,
    other: `u77_other_${sfx}`,
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

  async function cleanup() {
    await db.activityLog.deleteMany({ where: { actorId: { in: allIds } } });
    await db.invitation.deleteMany({ where: { invitedById: { in: allIds } } });
    await db.workspace.deleteMany({ where: { ownerId: { in: allIds } } });
    await db.user.deleteMany({ where: { id: { in: allIds } } });
  }

  const notificationsOf = (k: keyof typeof ids, type?: string) =>
    db.notification.findMany({
      where: { userId: ids[k], ...(type ? { type } : {}) },
      orderBy: { createdAt: "asc" },
    });

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
    const ws = await db.workspace.create({
      data: { ownerId: ids.owner, title: "Wiring WS" },
    });
    workspaceId = ws.id;
  });

  beforeEach(async () => {
    sentEmails.length = 0;
    clearUserPlanOverrides();
    setUserPlanOverride(ids.owner, "PRO");
    await db.notification.deleteMany({ where: { userId: { in: allIds } } });
    await db.userPreference.deleteMany({ where: { userId: { in: allIds } } });
  });

  afterAll(async () => {
    clearUserPlanOverrides();
    await cleanup();
  });

  it("invites a registered user in-app without persisting the raw token, and email follows preferences", async () => {
    await createInvitation(actorFor("owner"), {
      workspaceId,
      emailOrUsername: email("invitee"),
      role: "EDITOR",
    });

    const [n] = await notificationsOf("invitee", "INVITE_RECEIVED");
    expect(n).toBeDefined();
    const invitation = await db.invitation.findFirstOrThrow({
      where: { workspaceId, email: email("invitee"), status: "PENDING" },
    });
    const payload = n!.payload as Record<string, unknown>;
    expect(payload.href).toBe(`/invite/id/${invitation.id}`);
    expect(payload.inviteUrl).toBeUndefined();

    // The emailed token never lands in the notification row
    const sent = sentEmails.find((e) => e.to === email("invitee"));
    const token = String(sent?.data.inviteUrl ?? "").split("/invite/")[1];
    expect(token).toBeTruthy();
    expect(JSON.stringify(n!.payload)).not.toContain(token);

    // Turn the invite email off: resend delivers in-app only, replacing the old item
    await updateUserNotificationPreferences(ids.invitee, {
      INVITE_RECEIVED: { email: false },
    });
    sentEmails.length = 0;
    await resendInvitation(actorFor("owner"), {
      workspaceId,
      invitationId: invitation.id,
    });
    expect(sentEmails).toHaveLength(0);
    expect(await notificationsOf("invitee", "INVITE_RECEIVED")).toHaveLength(1);
  });

  it("emails people without an account directly", async () => {
    const outsider = `outsider_${sfx}@example.com`;
    await createInvitation(actorFor("owner"), {
      workspaceId,
      emailOrUsername: outsider,
      role: "VIEWER",
    });
    expect(sentEmails.some((e) => e.to === outsider && e.template === "invitation")).toBe(true);
  });

  it("only the invitee can view/accept by id; accepting notifies the inviter", async () => {
    await createInvitation(actorFor("owner"), {
      workspaceId,
      emailOrUsername: email("invitee"),
      role: "EDITOR",
    });
    const invitation = await db.invitation.findFirstOrThrow({
      where: { workspaceId, email: email("invitee"), status: "PENDING" },
    });

    expect(await getInvitationInfoById(null, invitation.id)).toMatchObject({
      valid: false,
      requiresSignIn: true,
    });
    expect(await getInvitationInfoById(actorFor("other"), invitation.id)).toMatchObject({
      valid: false,
    });
    await expect(
      acceptInvitationById(actorFor("other"), invitation.id)
    ).rejects.toMatchObject({ status: 400 });

    expect(await getInvitationInfoById(actorFor("invitee"), invitation.id)).toMatchObject({
      valid: true,
      signedInEmailMatches: true,
    });
    await acceptInvitationById(actorFor("invitee"), invitation.id);

    const [received] = await notificationsOf("invitee", "INVITE_RECEIVED");
    expect(received!.status).toBe("READ");

    const accepted = await notificationsOf("owner", "INVITE_ACCEPTED");
    expect(accepted).toHaveLength(1);
    expect((accepted[0]!.payload as Record<string, unknown>).acceptedByName).toBe("invitee");
  });

  it("notifies members of role changes and removal", async () => {
    await db.workspaceMember.create({
      data: { workspaceId, userId: ids.member, role: "VIEWER", invitedById: ids.owner },
    });

    await updateWorkspaceMemberRole(actorFor("owner"), workspaceId, ids.member, "EDITOR");
    const roleChanged = await notificationsOf("member", "ROLE_CHANGED");
    expect(roleChanged).toHaveLength(1);
    expect(roleChanged[0]!.payload).toMatchObject({ oldRole: "VIEWER", newRole: "EDITOR" });

    await removeWorkspaceMember(actorFor("owner"), workspaceId, ids.member);
    expect(await notificationsOf("member", "MEMBER_REMOVED")).toHaveLength(1);
  });

  it("concurrent preference updates for different types are both kept", async () => {
    await Promise.all([
      updateUserNotificationPreferences(ids.other, { SHARE_CREATED: { email: false } }),
      updateUserNotificationPreferences(ids.other, { NEW_SIGN_IN: { inApp: false } }),
      updateUserNotificationPreferences(ids.other, { CREDITS_LOW: { email: false } }),
    ]);
    const prefs = await getUserNotificationPreferences(ids.other);
    expect(prefs.SHARE_CREATED).toEqual({ inApp: true, email: false });
    expect(prefs.NEW_SIGN_IN).toEqual({ inApp: false, email: true });
    expect(prefs.CREDITS_LOW).toEqual({ inApp: true, email: false });
  });

  it("a dismissed notification stays dismissed when marked read", async () => {
    const { notification } = await notify(ids.other, "ROLE_CHANGED", {}, { email: false });
    await dismissNotification(ids.other, notification!.id);
    const after = await markNotificationRead(ids.other, notification!.id);
    expect(after.status).toBe("DISMISSED");
  });
});
