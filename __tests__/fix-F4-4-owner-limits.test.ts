/**
 * @jest-environment node
 *
 * F4.4 — the gates that depend on the workspace OWNER (who pays and whose plan
 * applies) get their numbers from the server, counted the same way as the
 * checks that enforce them:
 * - `GET /api/v1/workspaces/:id` → `attachmentLimits` (owner's plan + current
 *   count) and `ownerOutOfCredits` (a yes/no, never the balance);
 * - `GET …/members` → `inviteCapacity` (owner's plan, members + live invites),
 *   for people who can invite only.
 */
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { setUserPlanOverride } from "@/server/billing/plans";
import { getWorkspace } from "@/server/services/workspace";
import { listWorkspaceMembers } from "@/server/services/members";
import { getInviteCapacity } from "@/server/services/member-limits";

describe("F4.4 — owner limits and credits for plan gates", () => {
  const id = `f44o_${Date.now().toString().slice(-7)}`;
  const ownerId = `${id}_owner`;
  const memberId = `${id}_member`;
  const strangerId = `${id}_stranger`;
  const actorFor = (userId: string): Actor => ({
    userId,
    role: "USER",
    sessionId: `s_${userId}`,
    email: `${userId}@example.com`,
    name: userId,
  });
  const owner = actorFor(ownerId);
  const member = actorFor(memberId);
  const stranger = actorFor(strangerId);
  let workspaceId = "";

  beforeAll(async () => {
    for (const userId of [ownerId, memberId, strangerId]) {
      await db.user.create({
        data: { id: userId, email: `${userId}@example.com`, name: userId, emailVerified: true },
      });
    }
    workspaceId = (await db.workspace.create({ data: { title: "Limits", ownerId } })).id;
    await db.workspaceMember.create({
      data: { workspaceId, userId: memberId, role: "EDITOR", invitedById: ownerId },
    });
    await db.attachment.create({
      data: {
        ownerId: memberId,
        workspaceId,
        kind: "DOCUMENT",
        status: "READY",
        providerId: `${id}_p1`,
        resourceType: "raw",
        mime: "text/plain",
        bytes: 10,
        originalName: "a.txt",
      },
    });
    await db.creditAccount.create({ data: { userId: ownerId, planBalance: 50, topupBalance: 0 } });
    // The member's own plan must not matter: only the owner's does.
    setUserPlanOverride(memberId, "PRO");
    setUserPlanOverride(ownerId, "STANDARD");
  });

  afterAll(async () => {
    setUserPlanOverride(memberId, null);
    setUserPlanOverride(ownerId, null);
    await db.attachment.deleteMany({ where: { workspaceId } });
    await db.workspaceMember.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { ownerId } });
    await db.creditAccount.deleteMany({ where: { userId: ownerId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, memberId, strangerId] } } });
  });

  it("workspace: attachment limits come from the owner's plan, with the current count", async () => {
    const ws = await getWorkspace(member, workspaceId);
    // STANDARD: 25 attachments, 25 MB (the member's PRO would be 50 / 50).
    expect(ws.attachmentLimits).toEqual({ max: 25, used: 1, maxFileMB: 25 });
  });

  it("workspace: ownerOutOfCredits follows the owner's balance, not the viewer's", async () => {
    expect((await getWorkspace(member, workspaceId)).ownerOutOfCredits).toBe(false);
    await db.creditAccount.update({ where: { userId: ownerId }, data: { planBalance: 0 } });
    expect((await getWorkspace(member, workspaceId)).ownerOutOfCredits).toBe(true);
    // Only a yes/no reaches the client: no balance field.
    expect(JSON.stringify(await getWorkspace(member, workspaceId))).not.toMatch(/planBalance/);
  });

  it("workspace: memberCreditCapReached when the member used the monthly limit the owner set", async () => {
    const account = await db.creditAccount.findUniqueOrThrow({ where: { userId: ownerId } });
    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
      data: { monthlyCreditCap: 10 },
    });

    // Room left (nothing spent yet).
    expect((await getWorkspace(member, workspaceId)).memberCreditCapReached).toBeNull();

    // The member spent 10 of the owner's credits this month (as settled ledger rows).
    await db.creditLedger.create({
      data: {
        accountId: account.id,
        type: "SETTLE",
        planDelta: -10,
        topupDelta: 0,
        planAfter: 40,
        topupAfter: 0,
        actorId: memberId,
        idempotencyKey: `${id}_spend`,
      },
    });
    expect((await getWorkspace(member, workspaceId)).memberCreditCapReached).toEqual({ cap: 10 });

    // The owner has no cap; an unlimited member (null cap) neither.
    expect((await getWorkspace(owner, workspaceId)).memberCreditCapReached).toBeNull();
    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
      data: { monthlyCreditCap: null },
    });
    expect((await getWorkspace(member, workspaceId)).memberCreditCapReached).toBeNull();
    await db.creditLedger.deleteMany({ where: { idempotencyKey: `${id}_spend` } });
  });

  it("invite capacity counts members + live invitations against the owner's plan", async () => {
    const before = await getInviteCapacity(ownerId);
    // STANDARD: 1 collaborator across all the owner's workspaces (Step 8.1).
    expect(before).toMatchObject({ limit: 1, used: 1, inGrace: false });

    await db.invitation.create({
      data: {
        workspaceId,
        email: `${id}_invitee@example.com`,
        role: "VIEWER",
        tokenHash: `${id}_token`,
        invitedById: ownerId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await getInviteCapacity(ownerId)).used).toBe(2);
    await db.invitation.deleteMany({ where: { workspaceId } });
  });

  it("members list: the owner gets inviteCapacity; a member who can't invite doesn't", async () => {
    const asOwner = await listWorkspaceMembers(owner, workspaceId);
    expect(asOwner.inviteCapacity).toEqual({
      limit: 1,
      used: 1,
      inGrace: false,
      seatHolders: [`${memberId}@example.com`],
    });

    const asMember = await listWorkspaceMembers(member, workspaceId);
    expect(asMember.canManage).toBe(false);
    expect(asMember.inviteCapacity).toBeUndefined();
  });

  it("another user gets 404 for the workspace (and its limits)", async () => {
    await expect(getWorkspace(stranger, workspaceId)).rejects.toMatchObject({ status: 404 });
  });
});
