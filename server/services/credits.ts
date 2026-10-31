import "server-only";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";

export type ReserveContext = {
  generationId: string;
  actorId?: string | null;
  estimated?: boolean;
};

export type BalanceResult = {
  planBalance: number;
  topupBalance: number;
};

/**
 * Atomic hold: one statement, so two concurrent requests cannot both pass the check.
 * If idempotencyKey was already used, returns the existing state without deducting again.
 */
export async function reserve(
  accountId: string,
  n: number,
  key: string,
  ctx: ReserveContext
): Promise<BalanceResult> {
  if (n <= 0) {
    throw Errors.badRequest("Reservation amount must be greater than 0");
  }

  // Idempotency check before transaction
  const existing = await db.creditLedger.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) {
    return {
      planBalance: existing.planAfter,
      topupBalance: existing.topupAfter,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      // Re-check idempotency within transaction in case of concurrent attempt
      const innerExisting = await tx.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (innerExisting) {
        return {
          planBalance: innerExisting.planAfter,
          topupBalance: innerExisting.topupAfter,
        };
      }

      const rows = await tx.$queryRaw<{
        plan_balance: number;
        topup_balance: number;
        plan_before: number;
        topup_before: number;
      }[]>`
        WITH prev AS (
          SELECT id, plan_balance, topup_balance
          FROM credit_accounts
          WHERE id = ${accountId} AND plan_balance + topup_balance >= ${n}
          FOR UPDATE
        )
        UPDATE credit_accounts ca SET
          plan_balance  = ca.plan_balance  - LEAST(ca.plan_balance, ${n}),
          topup_balance = ca.topup_balance - (${n} - LEAST(ca.plan_balance, ${n})),
          updated_at = now()
        FROM prev
        WHERE ca.id = prev.id
        RETURNING
          ca.plan_balance,
          ca.topup_balance,
          prev.plan_balance AS plan_before,
          prev.topup_balance AS topup_before
      `;

      const row = rows[0];
      if (!row) {
        throw Errors.paymentRequired();
      }

      const planDelta = row.plan_balance - row.plan_before;
      const topupDelta = row.topup_balance - row.topup_before;

      await tx.creditLedger.create({
        data: {
          accountId,
          type: "RESERVE",
          planDelta,
          topupDelta,
          planAfter: row.plan_balance,
          topupAfter: row.topup_balance,
          generationId: ctx.generationId,
          actorId: ctx.actorId ?? null,
          estimated: ctx.estimated ?? true,
          reason: "ai.reservation",
          idempotencyKey: key,
        },
      });

      return {
        planBalance: row.plan_balance,
        topupBalance: row.topup_balance,
      };
    }, { timeout: 15000, maxWait: 10000 });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    // On race condition unique violation on idempotency_key, return existing ledger row
    if (
      err?.code === "P2002" ||
      err?.message?.includes("credit_ledger_idempotency_key_key")
    ) {
      const recorded = await db.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (recorded) {
        return {
          planBalance: recorded.planAfter,
          topupBalance: recorded.topupAfter,
        };
      }
    }
    throw error;
  }
}

/**
 * Settles a reservation against actual credit consumption.
 * Refunds unused reserved credits or charges extra up to remaining balance.
 */
export async function settle(
  accountId: string,
  generationId: string,
  actualCredits: number,
  key?: string
): Promise<BalanceResult> {
  const idempotencyKey = key ?? `settle:${generationId}`;

  const existing = await db.creditLedger.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return {
      planBalance: existing.planAfter,
      topupBalance: existing.topupAfter,
    };
  }

  if (actualCredits < 0) {
    throw Errors.badRequest("Actual credits cannot be negative");
  }

  try {
    return await db.$transaction(async (tx) => {
      const innerExisting = await tx.creditLedger.findUnique({
        where: { idempotencyKey },
      });
      if (innerExisting) {
        return {
          planBalance: innerExisting.planAfter,
          topupBalance: innerExisting.topupAfter,
        };
      }

      const reservation = await tx.creditLedger.findFirst({
        where: { accountId, generationId, type: "RESERVE" },
      });
      if (!reservation) {
        throw Errors.notFound("Reservation");
      }

      const alreadyFinalized = await tx.creditLedger.findFirst({
        where: {
          accountId,
          generationId,
          type: { in: ["SETTLE", "RELEASE"] },
        },
      });
      if (alreadyFinalized) {
        throw Errors.conflict("Generation has already been settled or released");
      }

      const reservedTotal = -(reservation.planDelta + reservation.topupDelta);
      const diff = reservedTotal - actualCredits;

      let planDelta = 0;
      let topupDelta = 0;
      let planBalance = 0;
      let topupBalance = 0;

      if (diff > 0) {
        // Refund unused reserved credits.
        // If topup credits were used in reservation, refund topup first.
        const topupRefund = Math.min(diff, -reservation.topupDelta);
        const planRefund = diff - topupRefund;

        const rows = await tx.$queryRaw<{
          plan_balance: number;
          topup_balance: number;
        }[]>`
          UPDATE credit_accounts SET
            plan_balance  = plan_balance  + ${planRefund},
            topup_balance = topup_balance + ${topupRefund},
            updated_at = now()
          WHERE id = ${accountId}
          RETURNING plan_balance, topup_balance
        `;
        const row = rows[0];
        if (!row) throw Errors.notFound("CreditAccount");

        planDelta = planRefund;
        topupDelta = topupRefund;
        planBalance = row.plan_balance;
        topupBalance = row.topup_balance;
      } else if (diff < 0) {
        // Extra credits needed: charge up to what's left
        const extra = -diff;
        const rows = await tx.$queryRaw<{
          plan_balance: number;
          topup_balance: number;
          plan_before: number;
          topup_before: number;
        }[]>`
          WITH prev AS (
            SELECT id, plan_balance, topup_balance
            FROM credit_accounts
            WHERE id = ${accountId}
            FOR UPDATE
          )
          UPDATE credit_accounts ca SET
            plan_balance  = ca.plan_balance  - LEAST(ca.plan_balance, ${extra}),
            topup_balance = ca.topup_balance - LEAST(ca.topup_balance, ${extra} - LEAST(ca.plan_balance, ${extra})),
            updated_at = now()
          FROM prev
          WHERE ca.id = prev.id
          RETURNING
            ca.plan_balance,
            ca.topup_balance,
            prev.plan_balance AS plan_before,
            prev.topup_balance AS topup_before
        `;
        const row = rows[0];
        if (!row) throw Errors.notFound("CreditAccount");

        planDelta = row.plan_balance - row.plan_before;
        topupDelta = row.topup_balance - row.topup_before;
        planBalance = row.plan_balance;
        topupBalance = row.topup_balance;
      } else {
        // diff === 0
        const acc = await tx.creditAccount.findUnique({
          where: { id: accountId },
        });
        if (!acc) throw Errors.notFound("CreditAccount");
        planBalance = acc.planBalance;
        topupBalance = acc.topupBalance;
      }

      await tx.creditLedger.create({
        data: {
          accountId,
          type: "SETTLE",
          planDelta,
          topupDelta,
          planAfter: planBalance,
          topupAfter: topupBalance,
          generationId,
          actorId: reservation.actorId,
          reason: "ai.settle",
          idempotencyKey,
        },
      });

      return { planBalance, topupBalance };
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "P2002" ||
      err?.message?.includes("credit_ledger_idempotency_key_key")
    ) {
      const recorded = await db.creditLedger.findUnique({
        where: { idempotencyKey },
      });
      if (recorded) {
        return {
          planBalance: recorded.planAfter,
          topupBalance: recorded.topupAfter,
        };
      }
    }
    throw error;
  }
}

/**
 * Fully releases a reservation back to the account.
 */
export async function release(
  accountId: string,
  generationId: string,
  key?: string
): Promise<BalanceResult> {
  const idempotencyKey = key ?? `release:${generationId}`;

  const existing = await db.creditLedger.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return {
      planBalance: existing.planAfter,
      topupBalance: existing.topupAfter,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      const innerExisting = await tx.creditLedger.findUnique({
        where: { idempotencyKey },
      });
      if (innerExisting) {
        return {
          planBalance: innerExisting.planAfter,
          topupBalance: innerExisting.topupAfter,
        };
      }

      const reservation = await tx.creditLedger.findFirst({
        where: { accountId, generationId, type: "RESERVE" },
      });
      if (!reservation) {
        throw Errors.notFound("Reservation");
      }

      const alreadyFinalized = await tx.creditLedger.findFirst({
        where: {
          accountId,
          generationId,
          type: { in: ["SETTLE", "RELEASE"] },
        },
      });
      if (alreadyFinalized) {
        throw Errors.conflict("Generation has already been settled or released");
      }

      const planRefund = -reservation.planDelta;
      const topupRefund = -reservation.topupDelta;

      const rows = await tx.$queryRaw<{
        plan_balance: number;
        topup_balance: number;
      }[]>`
        UPDATE credit_accounts SET
          plan_balance  = plan_balance  + ${planRefund},
          topup_balance = topup_balance + ${topupRefund},
          updated_at = now()
        WHERE id = ${accountId}
        RETURNING plan_balance, topup_balance
      `;
      const row = rows[0];
      if (!row) throw Errors.notFound("CreditAccount");

      await tx.creditLedger.create({
        data: {
          accountId,
          type: "RELEASE",
          planDelta: planRefund,
          topupDelta: topupRefund,
          planAfter: row.plan_balance,
          topupAfter: row.topup_balance,
          generationId,
          actorId: reservation.actorId,
          reason: "ai.release",
          idempotencyKey,
        },
      });

      return {
        planBalance: row.plan_balance,
        topupBalance: row.topup_balance,
      };
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "P2002" ||
      err?.message?.includes("credit_ledger_idempotency_key_key")
    ) {
      const recorded = await db.creditLedger.findUnique({
        where: { idempotencyKey },
      });
      if (recorded) {
        return {
          planBalance: recorded.planAfter,
          topupBalance: recorded.topupAfter,
        };
      }
    }
    throw error;
  }
}

/**
 * Grants plan allowance: sets planBalance = amount after writing an EXPIRE entry for any leftover plan credits.
 */
export async function grantPlan(
  accountId: string,
  amount: number,
  reason: string,
  key: string
): Promise<BalanceResult> {
  if (amount < 0) {
    throw Errors.badRequest("Grant amount cannot be negative");
  }

  const existing = await db.creditLedger.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) {
    return {
      planBalance: existing.planAfter,
      topupBalance: existing.topupAfter,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      const innerExisting = await tx.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (innerExisting) {
        return {
          planBalance: innerExisting.planAfter,
          topupBalance: innerExisting.topupAfter,
        };
      }

      const rows = await tx.$queryRaw<{
        id: string;
        plan_balance: number;
        topup_balance: number;
      }[]>`
        SELECT id, plan_balance, topup_balance
        FROM credit_accounts
        WHERE id = ${accountId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw Errors.notFound("CreditAccount");

      // Expire leftovers if any plan balance remained
      if (current.plan_balance > 0) {
        await tx.creditLedger.create({
          data: {
            accountId,
            type: "EXPIRE",
            planDelta: -current.plan_balance,
            topupDelta: 0,
            planAfter: 0,
            topupAfter: current.topup_balance,
            reason: "monthly_reset",
            idempotencyKey: `${key}:expire`,
          },
        });
      }

      // Update plan_balance to new amount
      const updated = await tx.$queryRaw<{
        plan_balance: number;
        topup_balance: number;
      }[]>`
        UPDATE credit_accounts SET
          plan_balance = ${amount},
          updated_at = now()
        WHERE id = ${accountId}
        RETURNING plan_balance, topup_balance
      `;
      const updatedRow = updated[0];
      if (!updatedRow) throw Errors.notFound("CreditAccount");

      await tx.creditLedger.create({
        data: {
          accountId,
          type: "GRANT",
          planDelta: amount,
          topupDelta: 0,
          planAfter: updatedRow.plan_balance,
          topupAfter: updatedRow.topup_balance,
          reason,
          idempotencyKey: key,
        },
      });

      return {
        planBalance: updatedRow.plan_balance,
        topupBalance: updatedRow.topup_balance,
      };
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "P2002" ||
      err?.message?.includes("credit_ledger_idempotency_key_key")
    ) {
      const recorded = await db.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (recorded) {
        return {
          planBalance: recorded.planAfter,
          topupBalance: recorded.topupAfter,
        };
      }
    }
    throw error;
  }
}

/**
 * Grants topup allowance (adds amount to topupBalance).
 */
export async function grantTopup(
  accountId: string,
  amount: number,
  reason: string,
  key: string
): Promise<BalanceResult> {
  if (amount <= 0) {
    throw Errors.badRequest("Topup grant amount must be greater than 0");
  }

  const existing = await db.creditLedger.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) {
    return {
      planBalance: existing.planAfter,
      topupBalance: existing.topupAfter,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      const innerExisting = await tx.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (innerExisting) {
        return {
          planBalance: innerExisting.planAfter,
          topupBalance: innerExisting.topupAfter,
        };
      }

      const rows = await tx.$queryRaw<{
        plan_balance: number;
        topup_balance: number;
      }[]>`
        UPDATE credit_accounts SET
          topup_balance = topup_balance + ${amount},
          updated_at = now()
        WHERE id = ${accountId}
        RETURNING plan_balance, topup_balance
      `;
      const row = rows[0];
      if (!row) throw Errors.notFound("CreditAccount");

      await tx.creditLedger.create({
        data: {
          accountId,
          type: "GRANT",
          planDelta: 0,
          topupDelta: amount,
          planAfter: row.plan_balance,
          topupAfter: row.topup_balance,
          reason,
          idempotencyKey: key,
        },
      });

      return {
        planBalance: row.plan_balance,
        topupBalance: row.topup_balance,
      };
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "P2002" ||
      err?.message?.includes("credit_ledger_idempotency_key_key")
    ) {
      const recorded = await db.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (recorded) {
        return {
          planBalance: recorded.planAfter,
          topupBalance: recorded.topupAfter,
        };
      }
    }
    throw error;
  }
}

/**
 * Manual credit adjustment (e.g. by an administrator or support).
 */
export async function adjust(
  accountId: string,
  delta: number | { plan?: number; topup?: number },
  reason: string,
  key: string,
  adminId?: string
): Promise<BalanceResult> {
  const existing = await db.creditLedger.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) {
    return {
      planBalance: existing.planAfter,
      topupBalance: existing.topupAfter,
    };
  }

  try {
    return await db.$transaction(async (tx) => {
      const innerExisting = await tx.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (innerExisting) {
        return {
          planBalance: innerExisting.planAfter,
          topupBalance: innerExisting.topupAfter,
        };
      }

      let planDelta = 0;
      let topupDelta = 0;

      if (typeof delta === "number") {
        if (delta >= 0) {
          topupDelta = delta;
        } else {
          // Negative adjustment: deduct from plan then topup
          const needed = -delta;
          const current = await tx.$queryRaw<{
            plan_balance: number;
            topup_balance: number;
          }[]>`
            SELECT plan_balance, topup_balance
            FROM credit_accounts
            WHERE id = ${accountId}
            FOR UPDATE
          `;
          const currentAccount = current[0];
          if (!currentAccount) throw Errors.notFound("CreditAccount");

          if (currentAccount.plan_balance + currentAccount.topup_balance < needed) {
            throw Errors.badRequest("Insufficient credits for adjustment");
          }

          const planDeduct = Math.min(currentAccount.plan_balance, needed);
          const topupDeduct = needed - planDeduct;
          planDelta = -planDeduct;
          topupDelta = -topupDeduct;
        }
      } else {
        planDelta = delta.plan ?? 0;
        topupDelta = delta.topup ?? 0;
      }

      const rows = await tx.$queryRaw<{
        plan_balance: number;
        topup_balance: number;
      }[]>`
        WITH prev AS (
          SELECT id, plan_balance, topup_balance
          FROM credit_accounts
          WHERE id = ${accountId}
            AND plan_balance + ${planDelta} >= 0
            AND topup_balance + ${topupDelta} >= 0
          FOR UPDATE
        )
        UPDATE credit_accounts ca SET
          plan_balance  = ca.plan_balance  + ${planDelta},
          topup_balance = ca.topup_balance + ${topupDelta},
          updated_at = now()
        FROM prev
        WHERE ca.id = prev.id
        RETURNING ca.plan_balance, ca.topup_balance
      `;
      const row = rows[0];
      if (!row) {
        throw Errors.badRequest("Adjustment would result in negative balance");
      }

      await tx.creditLedger.create({
        data: {
          accountId,
          type: "ADJUST",
          planDelta,
          topupDelta,
          planAfter: row.plan_balance,
          topupAfter: row.topup_balance,
          actorId: adminId ?? null,
          reason,
          idempotencyKey: key,
        },
      });

      return {
        planBalance: row.plan_balance,
        topupBalance: row.topup_balance,
      };
    });
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (
      err?.code === "P2002" ||
      err?.message?.includes("credit_ledger_idempotency_key_key")
    ) {
      const recorded = await db.creditLedger.findUnique({
        where: { idempotencyKey: key },
      });
      if (recorded) {
        return {
          planBalance: recorded.planAfter,
          topupBalance: recorded.topupAfter,
        };
      }
    }
    throw error;
  }
}

/**
 * Computes daily credit consumption for an account based on RESERVE and SETTLE deltas.
 */
export async function getDailyUsage(accountId: string): Promise<number> {
  const rows = await db.$queryRaw<{ total: bigint | number | null }[]>`
    SELECT COALESCE(SUM(-(plan_delta + topup_delta)), 0) AS total
    FROM credit_ledger
    WHERE account_id = ${accountId}
      AND type IN ('RESERVE', 'SETTLE')
      AND created_at >= date_trunc('day', now())
  `;
  const row = rows[0];
  return Number(row?.total ?? 0);
}

/**
 * Creates credit account on user sign-up with 100 free credits.
 */
export async function createAccountWithFreeGrant(userId: string) {
  const key = `signup:${userId}`;

  return db.$transaction(async (tx) => {
    let account = await tx.creditAccount.findUnique({
      where: { userId },
    });

    if (!account) {
      account = await tx.creditAccount.create({
        data: {
          userId,
          planBalance: 100,
          topupBalance: 0,
        },
      });

      await tx.creditLedger.create({
        data: {
          accountId: account.id,
          type: "GRANT",
          planDelta: 100,
          topupDelta: 0,
          planAfter: 100,
          topupAfter: 0,
          reason: "monthly_free",
          idempotencyKey: key,
        },
      });
    }

    return account;
  });
}

/**
 * Retrieves credit account by user ID.
 */
export async function getAccountByUserId(userId: string) {
  return db.creditAccount.findUnique({
    where: { userId },
  });
}

/**
 * Retrieves credit account by account ID.
 */
export async function getAccount(accountId: string) {
  return db.creditAccount.findUnique({
    where: { id: accountId },
  });
}
