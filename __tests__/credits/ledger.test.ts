/**
 * @jest-environment node
 */
import { db } from "@/server/db/client";
import {
  reserve,
  settle,
  release,
  grantPlan,
  grantTopup,
  adjust,
  getDailyUsage,
  createAccountWithFreeGrant,
  getAccount,
} from "@/server/services/credits";
import { ApiError } from "@/server/http/errors";

describe("Credit accounts and ledger (Step 2.2)", () => {
  // Helper to create a unique test user
  async function createTestUser() {
    const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const user = await db.user.create({
      data: {
        id,
        name: "Test User",
        email: `${id}@example.com`,
        emailVerified: true,
      },
    });
    return user;
  }

  // Clean up any test users created
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await db.$disconnect();
  });

  it("Requirement 1: 50 parallel reserve(..., 10) against balance of 100 -> exactly 10 succeed, balance 0, 10 ledger rows", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const account = await createAccountWithFreeGrant(user.id);
    expect(account.planBalance).toBe(100);
    expect(account.topupBalance).toBe(0);

    const promises = Array.from({ length: 50 }, (_, i) => {
      const genId = `gen_req1_${i}_${Date.now()}`;
      return reserve(account.id, 10, `reserve:${genId}`, {
        generationId: genId,
        actorId: user.id,
      })
        .then((res) => ({ status: "fulfilled" as const, value: res }))
        .catch((err) => ({ status: "rejected" as const, reason: err }));
    });

    const results = await Promise.all(promises);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(10);
    expect(rejected.length).toBe(40);

    // All rejected errors must be payment required (402)
    for (const rej of rejected) {
      expect(rej.reason).toBeInstanceOf(ApiError);
      expect((rej.reason as ApiError).status).toBe(402);
      expect((rej.reason as ApiError).code).toBe("insufficient_credits");
    }

    // Verify account balance is exactly 0
    const finalAccount = await getAccount(account.id);
    expect(finalAccount?.planBalance).toBe(0);
    expect(finalAccount?.topupBalance).toBe(0);

    // Exactly 10 RESERVE ledger entries were created
    const reserveRows = await db.creditLedger.findMany({
      where: { accountId: account.id, type: "RESERVE" },
    });
    expect(reserveRows.length).toBe(10);

    for (const row of reserveRows) {
      expect(row.planDelta).toBe(-10);
      expect(row.topupDelta).toBe(0);
    }
  });

  it("Requirement 2: Same idempotency key twice -> one deduction", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const account = await createAccountWithFreeGrant(user.id);
    expect(account.planBalance).toBe(100);

    const idempotencyKey = `reserve:idem_${user.id}_${Date.now()}`;
    const genId = `gen_idem_${user.id}`;

    // First call: deducts 10
    const res1 = await reserve(account.id, 10, idempotencyKey, {
      generationId: genId,
      actorId: user.id,
    });
    expect(res1.planBalance).toBe(90);

    // Second call with identical key: returns existing without extra deduction
    const res2 = await reserve(account.id, 10, idempotencyKey, {
      generationId: genId,
      actorId: user.id,
    });
    expect(res2.planBalance).toBe(90);

    // Verify account balance is 90
    const updatedAccount = await getAccount(account.id);
    expect(updatedAccount?.planBalance).toBe(90);

    // Exactly one ledger row exists for this key
    const rows = await db.creditLedger.findMany({
      where: { idempotencyKey },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.planDelta).toBe(-10);
  });

  it("Requirement 3: settle with actual < reserved refunds difference; release restores fully; balances never negative", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const account = await createAccountWithFreeGrant(user.id);
    expect(account.planBalance).toBe(100);

    // --- Part A: settle with actual < reserved refunds the difference ---
    const genSettle = `gen_settle_${Date.now()}`;
    await reserve(account.id, 30, `reserve:${genSettle}`, {
      generationId: genSettle,
      actorId: user.id,
    });

    let current = await getAccount(account.id);
    expect(current?.planBalance).toBe(70);

    // Actual usage is 20 -> 10 should be refunded
    const settleResult = await settle(account.id, genSettle, 20);
    expect(settleResult.planBalance).toBe(80);

    current = await getAccount(account.id);
    expect(current?.planBalance).toBe(80);

    const settleLedger = await db.creditLedger.findUnique({
      where: { idempotencyKey: `settle:${genSettle}` },
    });
    expect(settleLedger).toBeDefined();
    expect(settleLedger?.type).toBe("SETTLE");
    expect(settleLedger?.planDelta).toBe(10);

    // --- Part B: release restores reservation fully ---
    const genRelease = `gen_release_${Date.now()}`;
    await reserve(account.id, 30, `reserve:${genRelease}`, {
      generationId: genRelease,
      actorId: user.id,
    });

    current = await getAccount(account.id);
    expect(current?.planBalance).toBe(50);

    const releaseResult = await release(account.id, genRelease);
    expect(releaseResult.planBalance).toBe(80);

    current = await getAccount(account.id);
    expect(current?.planBalance).toBe(80);

    const releaseLedger = await db.creditLedger.findUnique({
      where: { idempotencyKey: `release:${genRelease}` },
    });
    expect(releaseLedger).toBeDefined();
    expect(releaseLedger?.type).toBe("RELEASE");
    expect(releaseLedger?.planDelta).toBe(30);

    // --- Part C: balances never negative ---
    // Attempting to reserve more than balance (e.g. 100 when balance is 80) is rejected
    await expect(
      reserve(account.id, 100, `reserve:over_${Date.now()}`, {
        generationId: `gen_over_${Date.now()}`,
        actorId: user.id,
      })
    ).rejects.toThrow();

    // Direct negative adjustment exceeding balance is rejected
    await expect(
      adjust(account.id, -200, "excess_penalty", `adj:neg_${Date.now()}`)
    ).rejects.toThrow();

    // Database check constraint credit_accounts_nonneg prevents negative values
    await expect(
      db.$executeRaw`UPDATE credit_accounts SET plan_balance = -5 WHERE id = ${account.id}`
    ).rejects.toThrow();

    const finalAccount = await getAccount(account.id);
    expect(finalAccount?.planBalance).toBe(80);
    expect(finalAccount?.topupBalance).toBe(0);
  });

  it("Requirement 4: Ledger replay: sum of deltas equals balance for random sequences", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const account = await createAccountWithFreeGrant(user.id);
    expect(account.planBalance).toBe(100);

    // Also grant topup to have mixed plan & topup credits
    await grantTopup(account.id, 50, "test_topup_purchase", `topup:${Date.now()}`);

    const activeReservations: { genId: string; amount: number }[] = [];

    // Run 20 pseudo-random operations
    for (let i = 0; i < 20; i++) {
      const currentAcc = (await getAccount(account.id))!;
      const totalBalance = currentAcc.planBalance + currentAcc.topupBalance;
      const opChoice = Math.floor(Math.random() * 5);

      if (opChoice === 0 && totalBalance >= 15) {
        // Reserve 10-15 credits
        const amount = Math.min(10 + (i % 5), totalBalance);
        const genId = `replay_gen_${i}_${Date.now()}`;
        await reserve(account.id, amount, `reserve:${genId}`, {
          generationId: genId,
          actorId: user.id,
        });
        activeReservations.push({ genId, amount });
      } else if (opChoice === 1 && activeReservations.length > 0) {
        // Settle one active reservation
        const target = activeReservations.pop()!;
        const actual = Math.floor(target.amount * 0.7); // 70% used, 30% refund
        await settle(account.id, target.genId, actual);
      } else if (opChoice === 2 && activeReservations.length > 0) {
        // Release one active reservation
        const target = activeReservations.pop()!;
        await release(account.id, target.genId);
      } else if (opChoice === 3) {
        // Small topup grant
        await grantTopup(
          account.id,
          20,
          "random_topup",
          `grant_topup_${i}_${Date.now()}`
        );
      } else {
        // Small adjustment
        if (totalBalance > 10) {
          await adjust(
            account.id,
            -5,
            "random_deduct",
            `adjust_${i}_${Date.now()}`
          );
        } else {
          await adjust(
            account.id,
            10,
            "random_credit",
            `adjust_${i}_${Date.now()}`
          );
        }
      }
    }

    // Verify ledger replay matches current account balance
    const finalAcc = (await getAccount(account.id))!;
    const allLedgerEntries = await db.creditLedger.findMany({
      where: { accountId: account.id },
    });

    const sumPlanDelta = allLedgerEntries.reduce((sum, e) => sum + e.planDelta, 0);
    const sumTopupDelta = allLedgerEntries.reduce(
      (sum, e) => sum + e.topupDelta,
      0
    );

    expect(sumPlanDelta).toBe(finalAcc.planBalance);
    expect(sumTopupDelta).toBe(finalAcc.topupBalance);
  });

  it("handles grantPlan with leftovers expired into EXPIRE ledger entry", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const account = await createAccountWithFreeGrant(user.id);
    expect(account.planBalance).toBe(100);

    // Next month: user has 40 credits left, granted 100
    // First spend 60
    const genId = `spend_60_${Date.now()}`;
    await reserve(account.id, 60, `reserve:${genId}`, {
      generationId: genId,
      actorId: user.id,
    });
    await settle(account.id, genId, 60);

    const beforeGrant = await getAccount(account.id);
    expect(beforeGrant?.planBalance).toBe(40);

    // Grant monthly plan 100
    const grantKey = `monthly_renew_${Date.now()}`;
    const result = await grantPlan(account.id, 100, "subscription.renew", grantKey);
    expect(result.planBalance).toBe(100);

    // Check EXPIRE row was written
    const expireRow = await db.creditLedger.findUnique({
      where: { idempotencyKey: `${grantKey}:expire` },
    });
    expect(expireRow).toBeDefined();
    expect(expireRow?.type).toBe("EXPIRE");
    expect(expireRow?.planDelta).toBe(-40);
    expect(expireRow?.planAfter).toBe(0);

    // Check GRANT row was written
    const grantRow = await db.creditLedger.findUnique({
      where: { idempotencyKey: grantKey },
    });
    expect(grantRow).toBeDefined();
    expect(grantRow?.type).toBe("GRANT");
    expect(grantRow?.planDelta).toBe(100);
    expect(grantRow?.planAfter).toBe(100);
  });

  it("calculates daily usage correctly across RESERVE and SETTLE", async () => {
    const user = await createTestUser();
    createdUserIds.push(user.id);

    const account = await createAccountWithFreeGrant(user.id);

    const gen1 = `usage_gen1_${Date.now()}`;
    await reserve(account.id, 30, `reserve:${gen1}`, {
      generationId: gen1,
      actorId: user.id,
    });
    // Reserve 30: daily usage should be 30
    let dailyUsage = await getDailyUsage(account.id);
    expect(dailyUsage).toBe(30);

    // Settle 20 (refund 10): daily usage should become 20
    await settle(account.id, gen1, 20);
    dailyUsage = await getDailyUsage(account.id);
    expect(dailyUsage).toBe(20);
  });
});
