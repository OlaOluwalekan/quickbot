/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import {
  setUserPlanOverride,
  clearUserPlanOverrides,
} from "@/server/billing/plans";
import {
  createAccountWithFreeGrant,
  getAccountByUserId,
  settle,
} from "@/server/services/credits";
import {
  DEFAULT_COLLABORATOR_MONTHLY_CAP,
  OWNER_OUT_OF_CREDITS_MESSAGE,
  resolveBilledAccount,
  resolveMemberMonthlyCreditCap,
  getMemberMonthlySpend,
  reserveForWorkspaceGeneration,
  getUsageByMember,
  clearThresholdNotificationsForTesting,
  waitForPendingOwnerNotifications,
} from "@/server/services/billing-owner";
import {
  listWorkspaceMembers,
  updateWorkspaceMemberCap,
  updateProjectMemberCap,
} from "@/server/services/members";
import { PATCH as patchWorkspaceMemberRoute } from "@/app/api/v1/workspaces/[id]/members/[userId]/route";

const sentEmails: Array<{
  template: string;
  to: string;
  data: Record<string, unknown>;
}> = [];

jest.mock("../server/email/send", () => ({
  sendEmail: jest.fn(
    async (template: string, to: string, data: Record<string, unknown>) => {
      sentEmails.push({ template, to, data });
      return { ok: true };
    }
  ),
  maskEmail: (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2"),
}));

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));

describe("Step 7.5 — Billing-owner resolution and collaborator spend controls", () => {
  const sfx = Date.now().toString().slice(-7);
  const ids = {
    owner: `u75_owner_${sfx}`,
    collab: `u75_collab_${sfx}`,
    admin: `u75_admin_${sfx}`,
    projectCollab: `u75_pcollab_${sfx}`,
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
    await db.generation.deleteMany({ where: { actorId: { in: allIds } } });
    await db.creditAccount.deleteMany({ where: { userId: { in: allIds } } });
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

    await createAccountWithFreeGrant(ids.owner);
    await createAccountWithFreeGrant(ids.collab);
    await createAccountWithFreeGrant(ids.admin);
    await createAccountWithFreeGrant(ids.projectCollab);

    const ws = await db.workspace.create({
      data: { ownerId: ids.owner, title: "Shared Billing WS" },
    });
    workspaceId = ws.id;

    await db.workspaceMember.createMany({
      data: [
        {
          workspaceId,
          userId: ids.collab,
          role: "EDITOR",
          invitedById: ids.owner,
        },
        {
          workspaceId,
          userId: ids.admin,
          role: "ADMIN",
          invitedById: ids.owner,
        },
      ],
    });

    const proj = await db.project.create({
      data: { ownerId: ids.owner, name: "Shared Billing Project" },
    });
    projectId = proj.id;

    await db.projectMember.create({
      data: {
        projectId,
        userId: ids.projectCollab,
        role: "EDITOR",
        invitedById: ids.owner,
      },
    });

    const pws = await db.workspace.create({
      data: {
        ownerId: ids.owner,
        projectId,
        title: "Inherited Project WS",
      },
    });
    projectWorkspaceId = pws.id;
  });

  beforeEach(async () => {
    sentEmails.length = 0;
    clearThresholdNotificationsForTesting();
    clearUserPlanOverrides();
    setUserPlanOverride(ids.owner, "FREE");
    // Reset owner account to 100 credits and collaborator account to 100 credits
    await db.creditAccount.update({
      where: { userId: ids.owner },
      data: { planBalance: 100, topupBalance: 0 },
    });
    await db.creditAccount.update({
      where: { userId: ids.collab },
      data: { planBalance: 100, topupBalance: 0 },
    });
  });

  afterAll(async () => {
    clearUserPlanOverrides();
    await cleanup();
  });

  it("resolveBilledAccount always resolves the workspace owner's CreditAccount, never the actor's", async () => {
    const ownerAcct = await getAccountByUserId(ids.owner);
    const collabAcct = await getAccountByUserId(ids.collab);

    const resolved = await resolveBilledAccount(workspaceId);
    expect(resolved.ownerId).toBe(ids.owner);
    expect(resolved.billedAccountId).toBe(ownerAcct!.id);
    expect(resolved.billedAccountId).not.toBe(collabAcct!.id);
  });

  it("collaborator generation charges the owner's account with actorId = collaborator and leaves collaborator's own balance untouched", async () => {
    const ownerBefore = await getAccountByUserId(ids.owner);
    const collabBefore = await getAccountByUserId(ids.collab);

    const genId = `gen_collab_${sfx}_1`;
    const res = await reserveForWorkspaceGeneration({
      workspace: workspaceId,
      actorId: ids.collab,
      amount: 15,
      reservationKey: `res_${genId}`,
      generationId: genId,
    });

    await db.generation.create({
      data: {
        id: genId,
        workspaceId,
        actorId: ids.collab,
        billedAccountId: res.billedAccountId,
        kind: "TEXT",
        status: "COMPLETED",
        modelKey: "text-economy",
        providerModelId: "gemini-flash",
        promptVersion: "v1",
        idempotencyKey: `idem_${genId}`,
        reservedCredits: 15,
        chargedCredits: 12,
      },
    });
    await settle(res.billedAccountId, genId, 12, `stl_${genId}`);

    const ownerAfter = await getAccountByUserId(ids.owner);
    const collabAfter = await getAccountByUserId(ids.collab);

    // Owner's balance decreased by settled amount (12)
    expect(ownerAfter!.planBalance).toBe(ownerBefore!.planBalance - 12);
    // Collaborator's own balance is completely untouched
    expect(collabAfter!.planBalance).toBe(collabBefore!.planBalance);
    expect(collabAfter!.topupBalance).toBe(collabBefore!.topupBalance);

    // Ledger entry is on owner's account with actorId = collaborator
    const ledgerRow = await db.creditLedger.findUnique({
      where: { idempotencyKey: `res_${genId}` },
    });
    expect(ledgerRow).not.toBeNull();
    expect(ledgerRow!.accountId).toBe(ownerBefore!.id);
    expect(ledgerRow!.actorId).toBe(ids.collab);

    // Spend tracking reflects 12 credits used by collaborator
    const spent = await getMemberMonthlySpend(ids.collab, ownerBefore!.id);
    expect(spent).toBe(12);
  });

  it("defaults monthlyCreditCap to 300 and enforces per-member cap (402 with cap message), while allowing owner to change or set unlimited", async () => {
    // Default is 300
    const initialCap = await resolveMemberMonthlyCreditCap(
      ids.collab,
      workspaceId
    );
    expect(initialCap).toBe(DEFAULT_COLLABORATOR_MONTHLY_CAP);

    // Non-owner (admin) cannot change member cap (403)
    await expect(
      updateWorkspaceMemberCap(actorFor("admin"), workspaceId, ids.collab, 50)
    ).rejects.toMatchObject({ status: 403 });

    // Owner lowers collaborator cap to 20 via API route
    mockActor = actorFor("owner");
    const req = new NextRequest(
      `http://localhost/api/v1/workspaces/${workspaceId}/members/${ids.collab}`,
      {
        method: "PATCH",
        body: JSON.stringify({ monthlyCreditCap: 20 }),
        headers: { "content-type": "application/json" },
      }
    );
    const patchRes = await patchWorkspaceMemberRoute(req, {
      params: Promise.resolve({ id: workspaceId, userId: ids.collab }),
    });
    expect(patchRes.status).toBe(200);
    mockActor = null;

    expect(await resolveMemberMonthlyCreditCap(ids.collab, workspaceId)).toBe(
      20
    );

    // Collaborator already spent 12 credits in previous test; requesting 10 more (12 + 10 = 22 > 20) must fail with 402
    const ownerBefore = await getAccountByUserId(ids.owner);
    await expect(
      reserveForWorkspaceGeneration({
        workspace: workspaceId,
        actorId: ids.collab,
        amount: 10,
        reservationKey: `res_cap_exceeded_${sfx}`,
        generationId: `gen_cap_exceeded_${sfx}`,
      })
    ).rejects.toMatchObject({
      status: 402,
      code: "collaborator_cap_exceeded",
      message: expect.stringContaining("monthly limit of 20 credits for this owner's workspaces"),
    });

    // Owner's balance was not deducted on rejected reservation
    const ownerAfterReject = await getAccountByUserId(ids.owner);
    expect(ownerAfterReject!.planBalance).toBe(ownerBefore!.planBalance);

    // Owner sets collaborator cap to null (unlimited)
    await updateWorkspaceMemberCap(
      actorFor("owner"),
      workspaceId,
      ids.collab,
      null
    );
    expect(
      await resolveMemberMonthlyCreditCap(ids.collab, workspaceId)
    ).toBeNull();

    // Now the 10-credit reservation succeeds
    const genId2 = `gen_unlimited_${sfx}`;
    await expect(
      reserveForWorkspaceGeneration({
        workspace: workspaceId,
        actorId: ids.collab,
        amount: 10,
        reservationKey: `res_${genId2}`,
        generationId: genId2,
      })
    ).resolves.toMatchObject({
      ownerId: ids.owner,
    });
  });

  it("enforces the cap atomically under concurrent reservations and lets an idempotent retry through", async () => {
    const ownerAcct = await getAccountByUserId(ids.owner);
    const used = await getMemberMonthlySpend(ids.collab, ownerAcct!.id);
    // Room for exactly one 6-credit reservation
    await updateWorkspaceMemberCap(actorFor("owner"), workspaceId, ids.collab, used + 10);

    // Hold the owner's account row lock so all three requests get through the
    // early (unlocked) cap check before any of them can reserve. Only the check
    // made under the lock can stop the second and third.
    let releaseLock!: () => void;
    const lockReleased = new Promise<void>((r) => (releaseLock = r));
    let lockTaken!: () => void;
    const lockHeld = new Promise<void>((r) => (lockTaken = r));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM credit_accounts WHERE id = ${ownerAcct!.id} FOR UPDATE`;
        lockTaken();
        await lockReleased;
      },
      { timeout: 20000 }
    );
    await lockHeld;

    const keys = [0, 1, 2].map((i) => `res_concurrent_${i}_${sfx}`);
    const pending = Promise.allSettled(
      keys.map((reservationKey, i) =>
        reserveForWorkspaceGeneration({
          workspace: workspaceId,
          actorId: ids.collab,
          amount: 6,
          reservationKey,
          generationId: `gen_concurrent_${i}_${sfx}`,
        })
      )
    );
    await new Promise((r) => setTimeout(r, 500));
    releaseLock();
    await holder;
    const results = await pending;
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ status: 402, code: "collaborator_cap_exceeded" });
    }
    expect(await getMemberMonthlySpend(ids.collab, ownerAcct!.id)).toBe(used + 6);

    // Retrying the reservation that went through is not re-checked against the
    // (now exhausted) cap and doesn't charge twice.
    const okKey = keys[results.findIndex((r) => r.status === "fulfilled")]!;
    await updateWorkspaceMemberCap(actorFor("owner"), workspaceId, ids.collab, 0);
    await expect(
      reserveForWorkspaceGeneration({
        workspace: workspaceId,
        actorId: ids.collab,
        amount: 6,
        reservationKey: okKey,
        generationId: "ignored-on-retry",
      })
    ).resolves.toMatchObject({ ownerId: ids.owner });
    expect(await getMemberMonthlySpend(ids.collab, ownerAcct!.id)).toBe(used + 6);

    await updateWorkspaceMemberCap(actorFor("owner"), workspaceId, ids.collab, null);
  });

  it("does not turn a project member into a workspace member when a cap is set on the workspace", async () => {
    await expect(
      updateWorkspaceMemberCap(actorFor("owner"), projectWorkspaceId, ids.projectCollab, 50)
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: projectWorkspaceId, userId: ids.projectCollab },
        },
      })
    ).toBeNull();
  });

  it("rejects a member PATCH that sets both role and monthlyCreditCap", async () => {
    mockActor = actorFor("owner");
    const req = new NextRequest(
      `http://localhost/api/v1/workspaces/${workspaceId}/members/${ids.collab}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: "VIEWER", monthlyCreditCap: 10 }),
        headers: { "content-type": "application/json" },
      }
    );
    const res = await patchWorkspaceMemberRoute(req, {
      params: Promise.resolve({ id: workspaceId, userId: ids.collab }),
    });
    mockActor = null;
    expect(res.status).toBe(422);
    const wm = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: ids.collab } },
    });
    expect(wm!.role).toBe("EDITOR");
  });

  it("enforces inherited ProjectMember.monthlyCreditCap on project workspaces", async () => {
    expect(
      await resolveMemberMonthlyCreditCap(
        ids.projectCollab,
        projectWorkspaceId
      )
    ).toBe(300);

    await updateProjectMemberCap(
      actorFor("owner"),
      projectId,
      ids.projectCollab,
      5
    );
    expect(
      await resolveMemberMonthlyCreditCap(
        ids.projectCollab,
        projectWorkspaceId
      )
    ).toBe(5);

    await expect(
      reserveForWorkspaceGeneration({
        workspace: projectWorkspaceId,
        actorId: ids.projectCollab,
        amount: 8,
        reservationKey: `res_proj_cap_${sfx}`,
        generationId: `gen_proj_cap_${sfx}`,
      })
    ).rejects.toMatchObject({
      status: 402,
      code: "collaborator_cap_exceeded",
    });
  });

  it("when owner is out of credits, collaborator gets neutral message without balance details and owner is notified", async () => {
    await db.creditAccount.update({
      where: { userId: ids.owner },
      data: { planBalance: 3, topupBalance: 0 },
    });

    await expect(
      reserveForWorkspaceGeneration({
        workspace: workspaceId,
        actorId: ids.collab,
        amount: 10,
        reservationKey: `res_owner_empty_${sfx}`,
        generationId: `gen_owner_empty_${sfx}`,
      })
    ).rejects.toMatchObject({
      status: 402,
      message: OWNER_OUT_OF_CREDITS_MESSAGE,
    });

    // Owner was notified via email
    await waitForPendingOwnerNotifications();
    expect(
      sentEmails.some(
        (e) => e.template === "credits-low" && e.to === email("owner")
      )
    ).toBe(true);
  });

  it("deduplicates 80% and 100% monthly allowance notifications per billing period", async () => {
    // Clean prior threshold logs for this owner
    await db.activityLog.deleteMany({
      where: {
        actorId: ids.owner,
        action: {
          in: [
            "billing.allowance_threshold_80",
            "billing.allowance_threshold_100",
          ],
        },
      },
    });
    clearThresholdNotificationsForTesting();
    sentEmails.length = 0;

    // Owner has 100 monthly allowance on FREE plan; already spent ~28 in earlier tests, so reserve 65 more to cross 80%
    const gen80a = `gen_80a_${sfx}`;
    await reserveForWorkspaceGeneration({
      workspace: workspaceId,
      actorId: ids.owner,
      amount: 65,
      reservationKey: `res_${gen80a}`,
      generationId: gen80a,
    });
    await waitForPendingOwnerNotifications();
    expect(sentEmails.filter((e) => e.to === email("owner"))).toHaveLength(1);

    // Another small reservation still between 80% and 100% must NOT re-send the 80% email
    const gen80b = `gen_80b_${sfx}`;
    await reserveForWorkspaceGeneration({
      workspace: workspaceId,
      actorId: ids.owner,
      amount: 5,
      reservationKey: `res_${gen80b}`,
      generationId: gen80b,
    });
    await waitForPendingOwnerNotifications();
    expect(sentEmails.filter((e) => e.to === email("owner"))).toHaveLength(1);

    // Exhaust remaining 30 credits to hit 100% -> sends 100% notification once
    const gen100a = `gen_100a_${sfx}`;
    await reserveForWorkspaceGeneration({
      workspace: workspaceId,
      actorId: ids.owner,
      amount: 30,
      reservationKey: `res_${gen100a}`,
      generationId: gen100a,
    });
    await waitForPendingOwnerNotifications();
    expect(sentEmails.filter((e) => e.to === email("owner"))).toHaveLength(2);

    // Subsequent out-of-credits attempt in the same period does NOT send a third email
    await expect(
      reserveForWorkspaceGeneration({
        workspace: workspaceId,
        actorId: ids.collab,
        amount: 5,
        reservationKey: `res_100b_${sfx}`,
        generationId: `gen_100b_${sfx}`,
      })
    ).rejects.toMatchObject({ status: 402 });
    await waitForPendingOwnerNotifications();
    expect(sentEmails.filter((e) => e.to === email("owner"))).toHaveLength(2);
  });

  it("getUsageByMember and listWorkspaceMembers report per-member credit usage", async () => {
    const usage = await getUsageByMember(ids.owner);
    const collabEntry = usage.find((u) => u.userId === ids.collab);
    expect(collabEntry).toBeDefined();
    expect(collabEntry!.chargedCredits).toBeGreaterThanOrEqual(12);
    expect(collabEntry!.isOwner).toBe(false);

    const membersRes = await listWorkspaceMembers(actorFor("owner"), workspaceId);
    const collabMember = membersRes.members.find(
      (m) => m.userId === ids.collab
    );
    expect(collabMember).toBeDefined();
    expect(collabMember!.monthlyCreditsUsed).toBeGreaterThanOrEqual(12);
  });
});
