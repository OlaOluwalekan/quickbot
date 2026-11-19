/**
 * @jest-environment node
 *
 * Step 8.1 — plan catalog, entitlements and subscription schema.
 * - every subscription status → effective plan (table-driven);
 * - `getEntitlements()` reads the `Subscription` row; `DEV_DEFAULT_PLAN` only
 *   applies without one, never in production;
 * - a DISPUTED subscription blocks spending credits (`billing_frozen`);
 * - the collaborator limit counts distinct people across all of the owner's
 *   workspaces and projects (owner decided 2026-11-14);
 * - `GET /api/v1/me/entitlements` needs a session and answers for the caller only.
 */
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { PLANS, clearUserPlanOverrides, setUserPlanOverride } from "@/server/billing/plans";
import {
  PAST_DUE_GRACE_MS,
  getEntitlements,
  resolveSubscriptionPlan,
  type SubscriptionPlanState,
} from "@/server/billing/entitlements";
import { release, reserve, settle } from "@/server/services/credits";
import { reserveForWorkspaceGeneration } from "@/server/services/billing-owner";
import {
  enforceMemberLimit,
  getInviteCapacity,
  restoreWithinLimit,
} from "@/server/services/member-limits";
import { createInvitation } from "@/server/services/invitation";
import { checkTransferFits } from "@/server/services/ownership-transfer";
import { GET as getMeEntitlementsRoute } from "@/app/api/v1/me/entitlements/route";

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));
jest.mock("../server/http/rate-limit", () => ({
  limit: jest.fn(async () => {}),
}));
jest.mock("../server/services/notify", () => ({
  ...jest.requireActual("../server/services/notify"),
  notify: jest.fn(async () => {}),
}));
jest.mock("../server/email/send", () => ({
  ...jest.requireActual("../server/email/send"),
  sendEmail: jest.fn(async () => ({ id: "test" })),
}));

const DAY = 24 * 60 * 60 * 1000;

describe("Step 8.1 — plan catalog and members", () => {
  it("collaboration limits: Free and Lite none, Standard 1, Pro 3", () => {
    expect(PLANS.FREE.limits.members).toBe(0);
    expect(PLANS.LITE.limits.members).toBe(0);
    expect(PLANS.STANDARD.limits.members).toBe(1);
    expect(PLANS.PRO.limits.members).toBe(3);
    expect(PLANS.LITE.features).not.toContain("Plans.LITE.features.collaborators");
  });
});

describe("Step 8.1 — resolveSubscriptionPlan (status → effective plan)", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const future = new Date(now.getTime() + 10 * DAY);
  const past = new Date(now.getTime() - 10 * DAY);
  const justEnded = new Date(now.getTime() - DAY); // inside the 3-day past-due grace
  const sub = (s: Partial<SubscriptionPlanState>): SubscriptionPlanState => ({
    plan: "STANDARD",
    status: "ACTIVE",
    currentPeriodEnd: future,
    cancelAtPeriodEnd: false,
    lastEventAt: null,
    ...s,
  });

  const cases: Array<[string, SubscriptionPlanState | null, string, boolean]> = [
    ["no subscription", null, "FREE", false],
    ["ACTIVE", sub({}), "STANDARD", false],
    ["TRIALING", sub({ status: "TRIALING", plan: "PRO" }), "PRO", false],
    ["ACTIVE, cancel scheduled, period running", sub({ cancelAtPeriodEnd: true }), "STANDARD", false],
    ["ACTIVE, cancel scheduled, period over", sub({ cancelAtPeriodEnd: true, currentPeriodEnd: past }), "FREE", false],
    ["PAST_DUE inside the 3-day grace", sub({ status: "PAST_DUE", currentPeriodEnd: justEnded }), "STANDARD", false],
    ["PAST_DUE after the grace", sub({ status: "PAST_DUE", currentPeriodEnd: past }), "FREE", false],
    [
      "PAST_DUE without period end, event inside grace",
      sub({ status: "PAST_DUE", currentPeriodEnd: null, lastEventAt: justEnded }),
      "STANDARD",
      false,
    ],
    [
      "PAST_DUE without period end, event after grace",
      sub({ status: "PAST_DUE", currentPeriodEnd: null, lastEventAt: past }),
      "FREE",
      false,
    ],
    ["CANCELED at period end, period running", sub({ status: "CANCELED", cancelAtPeriodEnd: true }), "STANDARD", false],
    [
      "CANCELED at period end, period over",
      sub({ status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: past }),
      "FREE",
      false,
    ],
    ["CANCELED immediately", sub({ status: "CANCELED" }), "FREE", false],
    ["EXPIRED", sub({ status: "EXPIRED" }), "FREE", false],
    ["PAUSED", sub({ status: "PAUSED" }), "FREE", false],
    ["DISPUTED (also blocks generation)", sub({ status: "DISPUTED" }), "FREE", true],
  ];

  it.each(cases)("%s", (_label, input, plan, blocked) => {
    expect(resolveSubscriptionPlan(input, now)).toEqual({ plan, generationBlocked: blocked });
  });

  it("the past-due grace is 3 days", () => {
    expect(PAST_DUE_GRACE_MS).toBe(3 * DAY);
    const end = new Date(now.getTime() - 3 * DAY + 1000);
    expect(resolveSubscriptionPlan(sub({ status: "PAST_DUE", currentPeriodEnd: end }), now).plan).toBe("STANDARD");
  });
});

describe("Step 8.1 — getEntitlements reads the subscription", () => {
  const sfx = Date.now().toString().slice(-7);
  const subUser = `s81_sub_${sfx}`;
  const noSubUser = `s81_nosub_${sfx}`;
  const disputedUser = `s81_disp_${sfx}`;
  const otherUser = `s81_other_${sfx}`;
  const users = [subUser, noSubUser, disputedUser, otherUser];
  const savedNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    await db.subscription.deleteMany({ where: { userId: { in: users } } });
    await db.creditAccount.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.user.createMany({
      data: users.map((id) => ({ id, email: `${id}@example.com`, name: id, emailVerified: true })),
    });
    const periodEnd = new Date(Date.now() + 20 * DAY);
    await db.subscription.create({
      data: { userId: subUser, plan: "PRO", interval: "month", status: "ACTIVE", currentPeriodEnd: periodEnd },
    });
    await db.subscription.create({
      data: { userId: disputedUser, plan: "PRO", interval: "year", status: "DISPUTED", currentPeriodEnd: periodEnd },
    });
    await db.creditAccount.createMany({
      data: [
        { userId: disputedUser, planBalance: 500, topupBalance: 0 },
        { userId: subUser, planBalance: 500, topupBalance: 0 },
      ],
    });
  });

  afterEach(() => {
    delete process.env.DEV_DEFAULT_PLAN;
    (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
    clearUserPlanOverrides();
    mockActor = null;
  });

  afterAll(async () => {
    await db.creditLedger.deleteMany({ where: { account: { userId: { in: users } } } });
    await db.creditAccount.deleteMany({ where: { userId: { in: users } } });
    await db.subscription.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  it("an ACTIVE subscription gives its plan", async () => {
    const ent = await getEntitlements(subUser);
    expect(ent.plan).toBe("PRO");
    expect(ent.limits.members).toBe(3);
    expect(ent.generationBlocked).toBe(false);
  });

  it("without a subscription: FREE, or DEV_DEFAULT_PLAN outside production", async () => {
    expect((await getEntitlements(noSubUser)).plan).toBe("FREE");
    process.env.DEV_DEFAULT_PLAN = "LITE";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect((await getEntitlements(noSubUser)).plan).toBe("LITE");
  });

  it("DEV_DEFAULT_PLAN never overrides a real subscription and is ignored in production", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.DEV_DEFAULT_PLAN = "LITE";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    expect((await getEntitlements(subUser)).plan).toBe("PRO");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect((await getEntitlements(noSubUser)).plan).toBe("FREE");
    warn.mockRestore();
  });

  it("a disputed subscription falls back to FREE and blocks spending its credits", async () => {
    const ent = await getEntitlements(disputedUser);
    expect(ent.plan).toBe("FREE");
    expect(ent.generationBlocked).toBe(true);

    const account = await db.creditAccount.findUniqueOrThrow({ where: { userId: disputedUser } });
    await expect(
      reserve(account.id, 5, `s81_res_disp_${sfx}`, { generationId: `s81_gen_disp_${sfx}` })
    ).rejects.toMatchObject({ status: 403, code: "billing_frozen" });
    expect(
      (await db.creditAccount.findUniqueOrThrow({ where: { userId: disputedUser } })).planBalance
    ).toBe(500);

    // Another account is not affected.
    const ok = await db.creditAccount.findUniqueOrThrow({ where: { userId: subUser } });
    await expect(
      reserve(ok.id, 5, `s81_res_ok_${sfx}`, { generationId: `s81_gen_ok_${sfx}` })
    ).resolves.toMatchObject({ planBalance: 495 });
  });

  it("GET /api/v1/me/entitlements: 401 without a session", async () => {
    const res = await getMeEntitlementsRoute(new NextRequest("http://localhost/api/v1/me/entitlements"));
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/me/entitlements answers for the caller only, from their subscription", async () => {
    mockActor = { userId: otherUser, role: "USER", sessionId: "s81", email: `${otherUser}@example.com` };
    const res = await getMeEntitlementsRoute(new NextRequest("http://localhost/api/v1/me/entitlements"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.plan).toBe("FREE"); // not subUser's PRO

    mockActor = { userId: subUser, role: "USER", sessionId: "s81b", email: `${subUser}@example.com` };
    const mine = await getMeEntitlementsRoute(new NextRequest("http://localhost/api/v1/me/entitlements"));
    expect((await mine.json()).data.plan).toBe("PRO");
  });
});

describe("Step 8.1 — collaborators are counted per person across all the owner's workspaces", () => {
  const sfx = Date.now().toString().slice(-7);
  const owner = `s81_own_${sfx}`;
  const alice = `s81_alice_${sfx}`;
  const bob = `s81_bob_${sfx}`;
  const carol = `s81_carol_${sfx}`;
  const recipient = `s81_rcpt_${sfx}`;
  const dave = `s81_dave_${sfx}`;
  const users = [owner, alice, bob, carol, recipient, dave];
  const email = (id: string) => `${id}@example.com`;
  const actor = (userId: string): Actor => ({
    userId,
    role: "USER",
    sessionId: `s_${userId}`,
    email: email(userId),
    name: userId,
  });
  let ws1 = "";
  let ws2 = "";
  let projectId = "";
  let recipientWs = "";

  async function cleanup() {
    await db.memberLimitGrace.deleteMany({ where: { ownerId: { in: users } } });
    await db.activityLog.deleteMany({ where: { actorId: { in: users } } });
    await db.invitation.deleteMany({ where: { invitedById: { in: users } } });
    await db.workspace.deleteMany({ where: { ownerId: { in: users } } });
    await db.project.deleteMany({ where: { ownerId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }

  beforeAll(async () => {
    await cleanup();
    await db.user.createMany({
      data: users.map((id) => ({ id, email: email(id), name: id, emailVerified: true })),
    });
    ws1 = (await db.workspace.create({ data: { ownerId: owner, title: "One" } })).id;
    ws2 = (await db.workspace.create({ data: { ownerId: owner, title: "Two" } })).id;
    projectId = (await db.project.create({ data: { ownerId: owner, name: "P" } })).id;
    // Alice is in both workspaces and the project: one person.
    await db.workspaceMember.createMany({
      data: [
        { workspaceId: ws1, userId: alice, role: "EDITOR", invitedById: owner, createdAt: new Date("2026-01-01") },
        { workspaceId: ws2, userId: alice, role: "EDITOR", invitedById: owner, createdAt: new Date("2026-01-05") },
        { workspaceId: ws2, userId: bob, role: "VIEWER", invitedById: owner, createdAt: new Date("2026-01-02") },
      ],
    });
    await db.projectMember.create({
      data: { projectId, userId: alice, role: "VIEWER", invitedById: owner },
    });
    recipientWs = (await db.workspace.create({ data: { ownerId: recipient, title: "R" } })).id;
    await db.workspaceMember.create({
      data: { workspaceId: recipientWs, userId: dave, role: "EDITOR", invitedById: recipient },
    });
  });

  afterEach(() => clearUserPlanOverrides());
  afterAll(cleanup);

  it("counts distinct people, not memberships", async () => {
    setUserPlanOverride(owner, "PRO");
    const cap = await getInviteCapacity(owner);
    expect(cap).toMatchObject({ limit: 3, used: 2, inGrace: false });
  });

  it("a pending invitation holds a seat across every workspace; seat holders can be invited anywhere", async () => {
    setUserPlanOverride(owner, "PRO");
    await createInvitation(actor(owner), { workspaceId: ws1, emailOrUsername: email(carol), role: "VIEWER" });
    expect((await getInviteCapacity(owner)).used).toBe(3);

    // Full: a new person is refused in any of the owner's workspaces…
    await expect(
      createInvitation(actor(owner), { workspaceId: ws2, emailOrUsername: "new_s81@example.com", role: "VIEWER" })
    ).rejects.toMatchObject({ status: 403, code: "member_limit_reached" });
    // …but Carol (invited) and Bob (member elsewhere) take no new seat.
    await createInvitation(actor(owner), { workspaceId: ws2, emailOrUsername: email(carol), role: "VIEWER" });
    await createInvitation(actor(owner), { projectId, emailOrUsername: email(bob), role: "VIEWER" });
    expect((await getInviteCapacity(owner)).used).toBe(3);

    await db.invitation.updateMany({ where: { invitedById: owner }, data: { status: "REVOKED" } });
  });

  it("Standard allows one person: inviting a second is refused", async () => {
    setUserPlanOverride(owner, "STANDARD");
    await expect(
      createInvitation(actor(owner), { workspaceId: ws1, emailOrUsername: email(carol), role: "VIEWER" })
    ).rejects.toMatchObject({ status: 403, code: "member_limit_reached" });
  });

  it("after the grace period, suspends whole people beyond the limit (all their memberships)", async () => {
    setUserPlanOverride(owner, "STANDARD");
    await db.memberLimitGrace.create({
      data: { ownerId: owner, limit: 1, graceEndsAt: new Date(Date.now() - 1000) },
    });
    const res = await enforceMemberLimit(owner);
    // Alice (added first) stays; Bob's one membership is suspended.
    expect(res).toEqual({ suspendedCount: 1, inGrace: false });
    const rows = await db.workspaceMember.findMany({
      where: { workspaceId: { in: [ws1, ws2] } },
      select: { userId: true, suspendedAt: true },
    });
    expect(rows.filter((r) => r.userId === alice).every((r) => r.suspendedAt === null)).toBe(true);
    expect(rows.find((r) => r.userId === bob)?.suspendedAt).not.toBeNull();
  });

  it("restores people while there is room; a person already active takes no seat", async () => {
    // Alice's ws2 membership is suspended too (e.g. by hand): restoring it costs nothing.
    await db.workspaceMember.updateMany({
      where: { workspaceId: ws2, userId: alice },
      data: { suspendedAt: new Date(), suspendedReason: "PLAN_LIMIT" },
    });
    const restored = await restoreWithinLimit(owner, 1);
    expect(restored.restoredCount).toBe(1);
    const rows = await db.workspaceMember.findMany({
      where: { workspaceId: ws2 },
      select: { userId: true, suspendedAt: true },
    });
    expect(rows.find((r) => r.userId === alice)?.suspendedAt).toBeNull();
    expect(rows.find((r) => r.userId === bob)?.suspendedAt).not.toBeNull();

    expect((await restoreWithinLimit(owner, 2)).restoredCount).toBe(1);
  });

  it("ownership transfer counts the recipient's existing collaborators too", async () => {
    // ws1 has Alice. The recipient already works with Dave: 2 people after the transfer.
    await db.workspaceMember.create({
      data: { workspaceId: ws1, userId: recipient, role: "EDITOR", invitedById: owner },
    });
    setUserPlanOverride(recipient, "STANDARD"); // 1 collaborator
    await expect(
      checkTransferFits({ workspaceId: ws1, toUserId: recipient, previousOwnerAction: "LEAVE" })
    ).rejects.toMatchObject({ status: 409, code: "transfer_member_limit" });

    setUserPlanOverride(recipient, "PRO");
    const fit = await checkTransferFits({ workspaceId: ws1, toUserId: recipient, previousOwnerAction: "LEAVE" });
    expect(fit).toMatchObject({ ok: true, limit: 3, collaboratorsAfter: 2 });

    // Someone the recipient already works with is counted once.
    await db.workspaceMember.create({
      data: { workspaceId: ws1, userId: dave, role: "VIEWER", invitedById: owner },
    });
    const again = await checkTransferFits({ workspaceId: ws1, toUserId: recipient, previousOwnerAction: "LEAVE" });
    expect(again.collaboratorsAfter).toBe(2);
  });
});

describe("Step 8.1 — the owner's plan caps daily credits and concurrent AI calls", () => {
  const sfx = Date.now().toString().slice(-7);
  const owner = `s81_cap_own_${sfx}`;
  const member = `s81_cap_mem_${sfx}`;
  let workspaceId = "";
  let accountId = "";
  let n = 0;
  const next = () => `${sfx}_${++n}`;

  async function cleanup() {
    await db.creditLedger.deleteMany({ where: { account: { userId: owner } } });
    await db.creditAccount.deleteMany({ where: { userId: owner } });
    await db.workspace.deleteMany({ where: { ownerId: owner } });
    await db.user.deleteMany({ where: { id: { in: [owner, member] } } });
  }

  beforeAll(async () => {
    await cleanup();
    await db.user.createMany({
      data: [owner, member].map((id) => ({ id, email: `${id}@example.com`, name: id, emailVerified: true })),
    });
    workspaceId = (await db.workspace.create({ data: { ownerId: owner, title: "Caps" } })).id;
    await db.workspaceMember.create({
      data: { workspaceId, userId: member, role: "EDITOR", invitedById: owner },
    });
    accountId = (await db.creditAccount.create({ data: { userId: owner, planBalance: 1000 } })).id;
  });
  beforeEach(async () => {
    clearUserPlanOverrides();
    await db.creditLedger.deleteMany({ where: { accountId } });
  });
  afterAll(cleanup);

  const reserveAs = (actorId: string, amount: number) => {
    const id = next();
    return reserveForWorkspaceGeneration({
      workspace: workspaceId,
      actorId,
      amount,
      reservationKey: `s81_res_${id}`,
      generationId: `s81_gen_${id}`,
    }).then((r) => ({ ...r, generationId: `s81_gen_${id}` }));
  };

  it("Free: one AI call at a time, counted on the owner's account (members included)", async () => {
    const first = await reserveAs(owner, 2);
    await expect(reserveAs(member, 2)).rejects.toMatchObject({ status: 429, code: "too_many_concurrent" });
    // Once the first call settles, the next one may start.
    await settle(accountId, first.generationId, 2);
    await expect(reserveAs(member, 2)).resolves.toMatchObject({ ownerId: owner });
  });

  it("a crashed call that never settled stops counting after the stale window", async () => {
    await reserveAs(owner, 2);
    await db.creditLedger.updateMany({
      where: { accountId, type: "RESERVE" },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await expect(reserveAs(owner, 2)).resolves.toBeTruthy();
  });

  it("Free: the daily credit cap (30) includes members' spending; released credits don't count", async () => {
    setUserPlanOverride(owner, "PRO"); // 5 concurrent, daily cap 700
    const a = await reserveAs(owner, 20);
    await release(accountId, a.generationId);
    setUserPlanOverride(owner, "FREE");
    const b = await reserveAs(member, 25);
    await settle(accountId, b.generationId, 25);
    await expect(reserveAs(owner, 6)).rejects.toMatchObject({ status: 429, code: "daily_cap_reached" });
    await expect(reserveAs(owner, 5)).resolves.toBeTruthy();
  });

  it("Pro allows 5 calls at once", async () => {
    setUserPlanOverride(owner, "PRO");
    for (let i = 0; i < 5; i++) await reserveAs(owner, 1);
    await expect(reserveAs(owner, 1)).rejects.toMatchObject({ code: "too_many_concurrent" });
  });
});
