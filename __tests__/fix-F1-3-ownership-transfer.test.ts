/**
 * @jest-environment node
 */

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

import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { resolveWorkspaceRole } from "@/server/authz/access";
import { setUserPlanOverride, clearUserPlanOverrides } from "@/server/billing/plans";
import {
  checkTransferFits,
  checkTransferFitsForOwner,
  requestOwnershipTransfer,
  acceptOwnershipTransfer,
  declineOwnershipTransfer,
  cancelOwnershipTransfer,
  listMyPendingTransfers,
} from "@/server/services/ownership-transfer";
import {
  startOverLimitGrace,
  enforceMemberLimit,
  restoreWithinLimit,
  isOwnerInGrace,
  setMemberKeepActive,
} from "@/server/services/member-limits";
import { createInvitation } from "@/server/services/invitation";

describe("Step F1.3 — Ownership transfer, member-limit checks, and suspension service", () => {
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    ownerA: `f13_oa_${sfx}`,
    ownerB: `f13_ob_${sfx}`,
    recipientFree: `f13_rf_${sfx}`,
    recipientPaid: `f13_rp_${sfx}`,
    collaborator1: `f13_c1_${sfx}`,
    collaborator2: `f13_c2_${sfx}`,
    collaborator3: `f13_c3_${sfx}`,
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

  let soloWorkspaceId = "";
  let multiWorkspaceId = "";
  let projectWorkspaceId = "";
  let projectAId = "";

  async function cleanup() {
    clearUserPlanOverrides();
    await db.memberLimitGrace.deleteMany({ where: { ownerId: { in: allIds } } });
    await db.ownershipTransfer.deleteMany({
      where: { OR: [{ fromUserId: { in: allIds } }, { toUserId: { in: allIds } }] },
    });
    await db.invitation.deleteMany({ where: { invitedById: { in: allIds } } });
    await db.generation.deleteMany({
      where: { workspace: { ownerId: { in: allIds } } },
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

    // Default plans
    setUserPlanOverride(ids.ownerA, "PRO"); // limit 20
    setUserPlanOverride(ids.ownerB, "PRO");
    setUserPlanOverride(ids.recipientFree, "FREE"); // limit 0
    setUserPlanOverride(ids.recipientPaid, "STANDARD"); // limit 5

    // Project owned by ownerA
    const proj = await db.project.create({
      data: {
        name: `Project A ${sfx}`,
        ownerId: ids.ownerA,
      },
    });
    projectAId = proj.id;

    // Solo workspace
    const soloWs = await db.workspace.create({
      data: {
        title: `Solo Workspace ${sfx}`,
        ownerId: ids.ownerA,
      },
    });
    soloWorkspaceId = soloWs.id;

    // Multi-member workspace
    const multiWs = await db.workspace.create({
      data: {
        title: `Multi Workspace ${sfx}`,
        ownerId: ids.ownerA,
      },
    });
    multiWorkspaceId = multiWs.id;

    // Project workspace
    const projWs = await db.workspace.create({
      data: {
        title: `Project Workspace ${sfx}`,
        ownerId: ids.ownerA,
        projectId: projectAId,
      },
    });
    projectWorkspaceId = projWs.id;

    // Add recipientFree as member to soloWorkspace (so they are eligible for transfer)
    await db.workspaceMember.create({
      data: {
        workspaceId: soloWorkspaceId,
        userId: ids.recipientFree,
        role: "EDITOR",
        invitedById: ids.ownerA,
      },
    });

    // Add members to multiWorkspace
    await db.workspaceMember.createMany({
      data: [
        { workspaceId: multiWorkspaceId, userId: ids.recipientFree, role: "EDITOR", invitedById: ids.ownerA },
        { workspaceId: multiWorkspaceId, userId: ids.recipientPaid, role: "EDITOR", invitedById: ids.ownerA },
        { workspaceId: multiWorkspaceId, userId: ids.collaborator1, role: "VIEWER", invitedById: ids.ownerA },
        { workspaceId: multiWorkspaceId, userId: ids.collaborator2, role: "VIEWER", invitedById: ids.ownerA },
      ],
    });

    // Add recipientPaid to projectWorkspace
    await db.workspaceMember.create({
      data: {
        workspaceId: projectWorkspaceId,
        userId: ids.recipientPaid,
        role: "EDITOR",
        invitedById: ids.ownerA,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("1. checkTransferFits & requestOwnershipTransfer", () => {
    it("blocks transfer to a Free user when other members remain (transfer_member_limit)", async () => {
      // In multiWorkspace, other members remain
      await expect(
        checkTransferFits({
          workspaceId: multiWorkspaceId,
          toUserId: ids.recipientFree,
          previousOwnerAction: "LEAVE",
        })
      ).rejects.toMatchObject({
        status: 409,
        code: "transfer_member_limit",
      });
    });

    it("blocks transfer of solo workspace to Free user when sender chooses STAY_ADMIN", async () => {
      // Free user has limit 0. If sender stays admin, collaboratorsAfter = 1 > 0
      await expect(
        checkTransferFits({
          workspaceId: soloWorkspaceId,
          toUserId: ids.recipientFree,
          previousOwnerAction: "STAY_ADMIN",
        })
      ).rejects.toMatchObject({
        status: 409,
        code: "transfer_member_limit",
      });
    });

    it("allows transfer of solo workspace to Free user when sender chooses LEAVE", async () => {
      // In solo workspace: only recipientFree and owner exist.
      // With LEAVE, collaboratorsAfter = 0, which fits Free limit 0!
      const fit = await checkTransferFits({
        workspaceId: soloWorkspaceId,
        toUserId: ids.recipientFree,
        previousOwnerAction: "LEAVE",
      });
      expect(fit.ok).toBe(true);
      expect(fit.collaboratorsAfter).toBe(0);
      expect(fit.limit).toBe(0);
    });

    it("blocks transfer when a Generation is RUNNING (transfer_busy)", async () => {
      const gen = await db.generation.create({
        data: {
          id: `gen_busy_${sfx}`,
          workspaceId: soloWorkspaceId,
          actorId: ids.ownerA,
          billedAccountId: `acct_${sfx}`,
          kind: "TEXT",
          status: "RUNNING",
          modelKey: "text-economy",
          providerModelId: "gemini-flash",
          promptVersion: "v1",
          idempotencyKey: `idem_busy_${sfx}`,
          reservedCredits: 10,
        },
      });

      try {
        await expect(
          checkTransferFits({
            workspaceId: soloWorkspaceId,
            toUserId: ids.recipientFree,
            previousOwnerAction: "LEAVE",
          })
        ).rejects.toMatchObject({
          status: 409,
          code: "transfer_busy",
        });
      } finally {
        await db.generation.delete({ where: { id: gen.id } });
      }
    });

    it("creates a PENDING transfer with 7 day expiry and previousOwnerAction", async () => {
      const transfer = await requestOwnershipTransfer(
        actorFor("ownerA"),
        { workspaceId: soloWorkspaceId },
        {
          toUserId: ids.recipientFree,
          previousOwnerAction: "LEAVE",
          confirm: "TRANSFER",
        }
      );

      expect(transfer.status).toBe("PENDING");
      expect(transfer.previousOwnerAction).toBe("LEAVE");
      expect(transfer.toUserId).toBe(ids.recipientFree);
      expect(transfer.fromUserId).toBe(ids.ownerA);

      // Recipient gets the request email (F1.3: notification + email)
      expect(
        sentEmails.some(
          (e) => e.template === "ownership-transfer-requested" && e.to === email("recipientFree")
        )
      ).toBe(true);

      // A second request while one is pending is refused
      await expect(
        requestOwnershipTransfer(
          actorFor("ownerA"),
          { workspaceId: soloWorkspaceId },
          { toUserId: ids.recipientFree, previousOwnerAction: "LEAVE", confirm: "TRANSFER" }
        )
      ).rejects.toMatchObject({ status: 409, code: "transfer_already_pending" });

      // Only participants can see a transfer: a stranger gets 404, the sender can't accept
      await expect(
        acceptOwnershipTransfer(actorFor("collaborator3"), transfer.id)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        declineOwnershipTransfer(actorFor("collaborator3"), transfer.id)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        cancelOwnershipTransfer(actorFor("collaborator3"), transfer.id)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        acceptOwnershipTransfer(actorFor("ownerA"), transfer.id)
      ).rejects.toMatchObject({ status: 403 });

      // Verify listed under recipient's pending transfers
      const pendingList = await listMyPendingTransfers(ids.recipientFree, "PENDING");
      expect(pendingList.some((t) => t.id === transfer.id)).toBe(true);

      // Cancel to clean up for subsequent tests
      await cancelOwnershipTransfer(actorFor("ownerA"), transfer.id);
      const afterCancel = await db.ownershipTransfer.findUnique({ where: { id: transfer.id } });
      expect(afterCancel?.status).toBe("CANCELLED");
    });
  });

  describe("1b. Authorization", () => {
    it("plan-fit preview: stranger gets 404, a non-owner member gets 403, owner gets the result", async () => {
      const input = { toUserId: ids.recipientPaid, previousOwnerAction: "LEAVE" as const };
      await expect(
        checkTransferFitsForOwner(actorFor("collaborator3"), { workspaceId: multiWorkspaceId }, input)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        checkTransferFitsForOwner(actorFor("collaborator1"), { workspaceId: multiWorkspaceId }, input)
      ).rejects.toMatchObject({ status: 403 });
      const fit = await checkTransferFitsForOwner(
        actorFor("ownerA"),
        { workspaceId: multiWorkspaceId },
        input
      );
      expect(fit).toMatchObject({ ok: true, limit: 5, collaboratorsAfter: 3 });
    });

    it("transfer request: stranger gets 404, a non-owner member gets 403", async () => {
      const input = { toUserId: ids.recipientPaid, previousOwnerAction: "LEAVE" as const, confirm: "TRANSFER" };
      await expect(
        requestOwnershipTransfer(actorFor("collaborator3"), { workspaceId: multiWorkspaceId }, input)
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        requestOwnershipTransfer(actorFor("collaborator1"), { workspaceId: multiWorkspaceId }, input)
      ).rejects.toMatchObject({ status: 403 });
    });

    it("requires the typed confirmation (TRANSFER or the exact name)", async () => {
      await expect(
        requestOwnershipTransfer(
          actorFor("ownerA"),
          { workspaceId: multiWorkspaceId },
          { toUserId: ids.recipientPaid, previousOwnerAction: "LEAVE", confirm: "yes" }
        )
      ).rejects.toMatchObject({ status: 400, code: "invalid_confirmation" });
    });

    it("refuses a recipient who is not a member", async () => {
      await expect(
        requestOwnershipTransfer(
          actorFor("ownerA"),
          { workspaceId: multiWorkspaceId },
          { toUserId: ids.collaborator3, previousOwnerAction: "LEAVE", confirm: "TRANSFER" }
        )
      ).rejects.toMatchObject({ status: 400, code: "recipient_not_member" });
    });
  });

  describe("2. Acceptance re-checks fit on downgrade", () => {
    it("re-checks fit on accept and throws 409 transfer_member_limit if recipient was downgraded", async () => {
      // 1. Recipient is STANDARD (limit 5). Transfer multiWorkspace (has ~3 remaining members).
      const transfer = await requestOwnershipTransfer(
        actorFor("ownerA"),
        { workspaceId: multiWorkspaceId },
        {
          toUserId: ids.recipientPaid,
          previousOwnerAction: "LEAVE",
          confirm: "TRANSFER",
        }
      );
      expect(transfer.status).toBe("PENDING");

      // 2. Downgrade recipientPaid to FREE before accept
      setUserPlanOverride(ids.recipientPaid, "FREE");

      // 3. Acceptance re-checks fit and must reject with 409 transfer_member_limit!
      await expect(
        acceptOwnershipTransfer(actorFor("recipientPaid"), transfer.id)
      ).rejects.toMatchObject({
        status: 409,
        code: "transfer_member_limit",
      });

      // Transfer remains PENDING
      const curr = await db.ownershipTransfer.findUnique({ where: { id: transfer.id } });
      expect(curr?.status).toBe("PENDING");

      // Restore plan and cancel request
      setUserPlanOverride(ids.recipientPaid, "STANDARD");
      await cancelOwnershipTransfer(actorFor("ownerA"), transfer.id);
    });
  });

  describe("3. Double-accept concurrency", () => {
    it("double-accept yields exactly one success and one 409 transfer_not_pending", async () => {
      const transfer = await requestOwnershipTransfer(
        actorFor("ownerA"),
        { workspaceId: soloWorkspaceId },
        {
          toUserId: ids.recipientFree,
          previousOwnerAction: "LEAVE",
          confirm: "TRANSFER",
        }
      );

      // Run two accepts concurrently
      const [res1, res2] = await Promise.allSettled([
        acceptOwnershipTransfer(actorFor("recipientFree"), transfer.id),
        acceptOwnershipTransfer(actorFor("recipientFree"), transfer.id),
      ]);

      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejections = [res1, res2].filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(rejections).toHaveLength(1);

      const err = (rejections[0] as PromiseRejectedResult).reason;
      expect(err).toMatchObject({
        status: 409,
        code: "transfer_not_pending",
      });

      // Workspace is now owned by recipientFree!
      const ws = await db.workspace.findUnique({ where: { id: soloWorkspaceId } });
      expect(ws?.ownerId).toBe(ids.recipientFree);

      // Since previousOwnerAction was LEAVE, ownerA is NOT a member
      const prevOwnerMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: soloWorkspaceId, userId: ids.ownerA } },
      });
      expect(prevOwnerMember).toBeNull();
    });
  });

  describe("4. Workspace in someone else's project detaches (projectId = null)", () => {
    it("clears projectId when workspace is transferred to a user other than project owner", async () => {
      // projectWorkspaceId belongs to projectA (ownerA).
      // Transfer to recipientPaid with STAY_ADMIN
      const transfer = await requestOwnershipTransfer(
        actorFor("ownerA"),
        { workspaceId: projectWorkspaceId },
        {
          toUserId: ids.recipientPaid,
          previousOwnerAction: "STAY_ADMIN",
          confirm: "TRANSFER",
        }
      );

      const result = await acceptOwnershipTransfer(actorFor("recipientPaid"), transfer.id);
      expect(result.success).toBe(true);

      const ws = await db.workspace.findUnique({ where: { id: projectWorkspaceId } });
      expect(ws?.ownerId).toBe(ids.recipientPaid);
      // Project ID must be detached!
      expect(ws?.projectId).toBeNull();

      // ownerA should now be an ADMIN member
      const adminMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: projectWorkspaceId, userId: ids.ownerA } },
      });
      expect(adminMember?.role).toBe("ADMIN");
    });
  });

  describe("5. Member limits and suspension service", () => {
    let testOwnerWsId = "";

    beforeAll(async () => {
      // Create a dedicated workspace for suspension testing
      const ws = await db.workspace.create({
        data: {
          title: `Suspension Ws ${sfx}`,
          ownerId: ids.ownerB,
        },
      });
      testOwnerWsId = ws.id;

      // Add 3 collaborators at different times
      await db.workspaceMember.create({
        data: {
          workspaceId: testOwnerWsId,
          userId: ids.collaborator1,
          role: "EDITOR",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          keepActive: false,
          invitedById: ids.ownerB,
        },
      });

      await db.workspaceMember.create({
        data: {
          workspaceId: testOwnerWsId,
          userId: ids.collaborator2,
          role: "EDITOR",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          keepActive: true, // Marked to keep active!
          invitedById: ids.ownerB,
        },
      });

      await db.workspaceMember.create({
        data: {
          workspaceId: testOwnerWsId,
          userId: ids.collaborator3,
          role: "EDITOR",
          createdAt: new Date("2026-01-03T00:00:00Z"),
          keepActive: false,
          invitedById: ids.ownerB,
        },
      });
    });

    it("startOverLimitGrace creates grace record and blocks new invitations", async () => {
      const grace = await startOverLimitGrace(ids.ownerB, 1);
      expect(grace.limit).toBe(1);

      const inGrace = await isOwnerInGrace(ids.ownerB);
      expect(inGrace).toBe(true);

      // Attempting to create an invitation must be blocked with 403 member_limit_exceeded
      await expect(
        createInvitation(actorFor("ownerB"), {
          workspaceId: testOwnerWsId,
          emailOrUsername: "newguy@example.com",
          role: "VIEWER",
        })
      ).rejects.toMatchObject({
        status: 403,
        code: "member_limit_exceeded",
      });
    });

    it("only the owner can set Keep active", async () => {
      await expect(
        setMemberKeepActive(actorFor("collaborator1"), {
          workspaceId: testOwnerWsId,
          targetUserId: ids.collaborator3,
          keepActive: true,
        })
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        setMemberKeepActive(actorFor("ownerA"), {
          workspaceId: testOwnerWsId,
          targetUserId: ids.collaborator3,
          keepActive: true,
        })
      ).rejects.toMatchObject({ status: 404 });
      const m3 = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: testOwnerWsId, userId: ids.collaborator3 } },
      });
      expect(m3?.keepActive).toBe(false);
    });

    it("enforceMemberLimit does nothing while the grace period is running", async () => {
      const res = await enforceMemberLimit(ids.ownerB);
      expect(res).toEqual({ suspendedCount: 0, inGrace: true });
      const suspended = await db.workspaceMember.count({
        where: { workspaceId: testOwnerWsId, suspendedAt: { not: null } },
      });
      expect(suspended).toBe(0);
    });

    it("enforceMemberLimit suspends members beyond the limit, respecting keepActive", async () => {
      // Grace has ended.
      await db.memberLimitGrace.update({
        where: { ownerId: ids.ownerB },
        data: { graceEndsAt: new Date(Date.now() - 1000) },
      });

      // Limit is 1. There are 3 collaborators:
      // c1: createdAt Jan 1, keepActive false
      // c2: createdAt Jan 2, keepActive TRUE (protected!)
      // c3: createdAt Jan 3, keepActive false
      // We need 1 active. c2 is keepActive so stays active.
      // Between c1 and c3, c3 is newer so it gets suspended first, and c1 also suspended because limit = 1 and c2 took it!
      const enforced = await enforceMemberLimit(ids.ownerB);
      expect(enforced.suspendedCount).toBe(2);

      const m2 = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: testOwnerWsId, userId: ids.collaborator2 } },
      });
      // c2 was keepActive, so should NOT be suspended
      expect(m2?.suspendedAt).toBeNull();

      const m3 = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: testOwnerWsId, userId: ids.collaborator3 } },
      });
      // c3 was newest and not keepActive -> suspended
      expect(m3?.suspendedAt).not.toBeNull();
      expect(m3?.suspendedReason).toBe("PLAN_LIMIT");
    });

    it("suspended members get read-only access (403 on comment/ask, 200 on read)", async () => {
      const access = await resolveWorkspaceRole(ids.collaborator3, testOwnerWsId);
      // Suspended member contributes VIEWER
      expect(access?.role).toBe("VIEWER");
      expect(access?.capabilities.has("workspace.read")).toBe(true);
      expect(access?.capabilities.has("workspace.comment")).toBe(false);
      expect(access?.capabilities.has("workspace.ask")).toBe(false);
      expect(access?.capabilities.has("workspace.generate")).toBe(false);
    });

    it("restoreWithinLimit un-suspends oldest first", async () => {
      // Suspend all 3 first manually to test restore ordering
      await db.workspaceMember.updateMany({
        where: { workspaceId: testOwnerWsId },
        data: { suspendedAt: new Date(), suspendedReason: "PLAN_LIMIT" },
      });

      // Restore up to limit 2
      const restored = await restoreWithinLimit(ids.ownerB, 2);
      expect(restored.restoredCount).toBe(2);

      const m1 = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: testOwnerWsId, userId: ids.collaborator1 } },
      });
      const m2 = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: testOwnerWsId, userId: ids.collaborator2 } },
      });
      const m3 = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: testOwnerWsId, userId: ids.collaborator3 } },
      });

      // Oldest (c1: Jan 1) and second oldest (c2: Jan 2) must be restored!
      expect(m1?.suspendedAt).toBeNull();
      expect(m2?.suspendedAt).toBeNull();
      // Newest (c3: Jan 3) remains suspended
      expect(m3?.suspendedAt).not.toBeNull();
    });
  });
});
