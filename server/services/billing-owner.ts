import "server-only";
import { db } from "@/server/db/client";
import { ApiError, Errors } from "@/server/http/errors";
import {
  createAccountWithFreeGrant,
  getAccountByUserId,
  reserve,
  type BalanceResult,
} from "@/server/services/credits";
import {
  PLANS,
  type PlanKey,
} from "@/server/billing/plans";
import { getEntitlements } from "@/server/billing/entitlements";
import { env } from "@/server/env";
import { logActivity } from "@/server/services/activity";
import { notify } from "@/server/services/notify";
import type { Prisma } from "@/server/db/generated/client";

type DbClient = Prisma.TransactionClient | typeof db;

export const DEFAULT_COLLABORATOR_MONTHLY_CAP = 300;

export const OWNER_OUT_OF_CREDITS_MESSAGE =
  "The workspace owner has no credits left";

export type WorkspaceBillingTarget =
  | string
  | {
      id: string;
      ownerId: string;
      projectId?: string | null;
    };

export function getCurrentBillingPeriodStart(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );
}

export function getCurrentBillingPeriodKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

async function normalizeWorkspaceTarget(target: WorkspaceBillingTarget): Promise<{
  id: string;
  ownerId: string;
  projectId: string | null;
}> {
  if (typeof target === "string") {
    const ws = await db.workspace.findUnique({
      where: { id: target },
      select: { id: true, ownerId: true, projectId: true },
    });
    if (!ws) {
      throw Errors.notFound("Workspace");
    }
    return {
      id: ws.id,
      ownerId: ws.ownerId,
      projectId: ws.projectId ?? null,
    };
  }

  if (target.projectId === undefined) {
    const ws = await db.workspace.findUnique({
      where: { id: target.id },
      select: { projectId: true },
    });
    return {
      id: target.id,
      ownerId: target.ownerId,
      projectId: ws?.projectId ?? null,
    };
  }

  return {
    id: target.id,
    ownerId: target.ownerId,
    projectId: target.projectId ?? null,
  };
}

/**
 * Resolves the billed credit account for a workspace.
 * Always returns the workspace OWNER's CreditAccount (never the collaborator's).
 */
export async function resolveBilledAccount(workspaceOrId: WorkspaceBillingTarget) {
  const ws = await normalizeWorkspaceTarget(workspaceOrId);
  let account = await getAccountByUserId(ws.ownerId);
  if (!account) {
    account = await createAccountWithFreeGrant(ws.ownerId);
  }
  return {
    account,
    billedAccountId: account.id,
    ownerId: ws.ownerId,
    workspaceId: ws.id,
    projectId: ws.projectId,
  };
}

/**
 * Resolves the effective plan key for a workspace/project owner.
 */
export async function resolveOwnerPlanKey(
  ownerId: string,
  _account?: { planBalance: number } | null
): Promise<PlanKey> {
  const entitlements = await getEntitlements(ownerId);
  return entitlements.plan;
}

/**
 * Resolves a collaborator's effective monthly credit cap for a workspace.
 * - Owner has no collaborator cap (`null`).
 * - Explicit `WorkspaceMember` row (if role != NONE) takes precedence over `ProjectMember`.
 * - `null` means unlimited.
 */
export async function resolveMemberMonthlyCreditCap(
  userId: string,
  workspaceOrId: WorkspaceBillingTarget
): Promise<number | null> {
  const ws = await normalizeWorkspaceTarget(workspaceOrId);
  if (userId === ws.ownerId) {
    return null;
  }

  const wm = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: ws.id,
        userId,
      },
    },
    select: { role: true, monthlyCreditCap: true },
  });

  if (wm && wm.role !== "NONE") {
    return wm.monthlyCreditCap;
  }

  if (ws.projectId) {
    const pm = await db.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: ws.projectId,
          userId,
        },
      },
      select: { monthlyCreditCap: true },
    });
    if (pm) {
      return pm.monthlyCreditCap;
    }
  }

  return DEFAULT_COLLABORATOR_MONTHLY_CAP;
}

/**
 * Computes a member's total credit spend against an owner's CreditAccount
 * within the current monthly billing period:
 * `SUM(charged) WHERE actorId = member AND billedAccountId = owner AND period`
 * (including active running reservations and settled ledger entries).
 */
export async function getMemberMonthlySpend(
  actorId: string,
  billedAccountId: string,
  periodStart: Date = getCurrentBillingPeriodStart(),
  client: DbClient = db
): Promise<number> {
  const genRows = await client.$queryRaw<{ total: bigint | number | null }[]>`
    SELECT COALESCE(
      SUM(
        CASE
          WHEN status = 'RUNNING'::"GenStatus" AND charged_credits = 0 THEN reserved_credits
          ELSE charged_credits
        END
      ),
      0
    ) AS total
    FROM generations
    WHERE actor_id = ${actorId}
      AND billed_account_id = ${billedAccountId}
      AND created_at >= ${periodStart}
      AND status IN ('COMPLETED'::"GenStatus", 'RUNNING'::"GenStatus", 'CANCELLED'::"GenStatus")
  `;

  const ledgerRows = await client.$queryRaw<{ total: bigint | number | null }[]>`
    SELECT COALESCE(SUM(-(plan_delta + topup_delta)), 0) AS total
    FROM credit_ledger
    WHERE account_id = ${billedAccountId}
      AND actor_id = ${actorId}
      AND type IN ('RESERVE'::"LedgerType", 'SETTLE'::"LedgerType", 'RELEASE'::"LedgerType")
      AND created_at >= ${periodStart}
  `;

  const fromGenerations = Math.max(0, Number(genRows[0]?.total ?? 0));
  const fromLedger = Math.max(0, Number(ledgerRows[0]?.total ?? 0));
  return Math.max(fromGenerations, fromLedger);
}

/**
 * Same figure as `getMemberMonthlySpend`, for every actor on the account at
 * once (two grouped queries instead of two per member). Used by member lists.
 */
export async function getMonthlySpendByActor(
  billedAccountId: string,
  periodStart: Date = getCurrentBillingPeriodStart()
): Promise<Map<string, number>> {
  const [genRows, ledgerRows] = await Promise.all([
    db.$queryRaw<{ actor_id: string; total: bigint | number | null }[]>`
      SELECT actor_id, COALESCE(
        SUM(
          CASE
            WHEN status = 'RUNNING'::"GenStatus" AND charged_credits = 0 THEN reserved_credits
            ELSE charged_credits
          END
        ),
        0
      ) AS total
      FROM generations
      WHERE billed_account_id = ${billedAccountId}
        AND created_at >= ${periodStart}
        AND status IN ('COMPLETED'::"GenStatus", 'RUNNING'::"GenStatus", 'CANCELLED'::"GenStatus")
      GROUP BY actor_id
    `,
    db.$queryRaw<{ actor_id: string | null; total: bigint | number | null }[]>`
      SELECT actor_id, COALESCE(SUM(-(plan_delta + topup_delta)), 0) AS total
      FROM credit_ledger
      WHERE account_id = ${billedAccountId}
        AND actor_id IS NOT NULL
        AND type IN ('RESERVE'::"LedgerType", 'SETTLE'::"LedgerType", 'RELEASE'::"LedgerType")
        AND created_at >= ${periodStart}
      GROUP BY actor_id
    `,
  ]);

  const spend = new Map<string, number>();
  for (const r of [...genRows, ...ledgerRows]) {
    if (!r.actor_id) continue;
    const total = Math.max(0, Number(r.total ?? 0));
    spend.set(r.actor_id, Math.max(spend.get(r.actor_id) ?? 0, total));
  }
  return spend;
}

// In-memory deduplication fallback alongside DB activity log deduplication
const sentThresholdNotifications = new Set<string>();

export function clearThresholdNotificationsForTesting(): void {
  sentThresholdNotifications.clear();
}

// Threshold checks started in the background by reserveForWorkspaceGeneration
const pendingThresholdChecks = new Set<Promise<unknown>>();

/** Resolves once every background allowance-threshold check has finished. */
export async function waitForPendingOwnerNotifications(): Promise<void> {
  while (pendingThresholdChecks.size > 0) {
    await Promise.allSettled(Array.from(pendingThresholdChecks));
  }
}

/**
 * Checks whether the owner has reached 80% or 100% of their monthly allowance
 * and sends a deduplicated notification (once per threshold per billing period).
 */
export async function checkAndNotifyOwnerAllowanceThresholds(opts: {
  ownerId: string;
  accountId: string;
  workspaceId?: string | null;
  remainingBalance?: number;
  force100?: boolean;
}): Promise<{ notified80: boolean; notified100: boolean }> {
  const { ownerId, accountId, workspaceId } = opts;
  const periodStart = getCurrentBillingPeriodStart();
  const periodKey = getCurrentBillingPeriodKey();

  const account = await db.creditAccount.findUnique({
    where: { id: accountId },
    select: { planBalance: true, topupBalance: true },
  });

  const planKey = await resolveOwnerPlanKey(ownerId, account);
  const monthlyAllowance = PLANS[planKey]?.credits ?? 100;

  // Compute total credits spent on the owner's account this period
  const spentRows = await db.$queryRaw<{ total: bigint | number | null }[]>`
    SELECT COALESCE(SUM(-(plan_delta + topup_delta)), 0) AS total
    FROM credit_ledger
    WHERE account_id = ${accountId}
      AND type IN ('RESERVE'::"LedgerType", 'SETTLE'::"LedgerType", 'RELEASE'::"LedgerType")
      AND created_at >= ${periodStart}
  `;
  const spentThisPeriod = Math.max(0, Number(spentRows[0]?.total ?? 0));
  const remaining =
    opts.remainingBalance !== undefined
      ? opts.remainingBalance
      : (account?.planBalance ?? 0) + (account?.topupBalance ?? 0);

  const ratioUsed =
    monthlyAllowance > 0 ? spentThisPeriod / monthlyAllowance : 0;
  const reached100 =
    Boolean(opts.force100) || remaining <= 0 || ratioUsed >= 1.0;
  const reached80 = reached100 || ratioUsed >= 0.8;

  let notified80 = false;
  let notified100 = false;

  const notifyThreshold = async (threshold: 80 | 100): Promise<boolean> => {
    const action = `billing.allowance_threshold_${threshold}`;
    const memKey = `${ownerId}:${periodKey}:${threshold}`;
    if (sentThresholdNotifications.has(memKey)) {
      return false;
    }

    const existing = await db.activityLog.findFirst({
      where: {
        actorId: ownerId,
        action,
        createdAt: { gte: periodStart },
      },
      select: { id: true },
    });
    if (existing) {
      sentThresholdNotifications.add(memKey);
      return false;
    }

    sentThresholdNotifications.add(memKey);

    await logActivity(db, {
      workspaceId: workspaceId ?? null,
      actorId: ownerId,
      action,
      targetType: "credit_account",
      targetId: accountId,
      meta: {
        threshold,
        period: periodKey,
        remainingCredits: Math.max(0, remaining),
        spentThisPeriod,
        monthlyAllowance,
      },
    });

    await notify(
      ownerId,
      threshold === 100 ? "CREDITS_EXHAUSTED" : "CREDITS_LOW",
      {
        threshold,
        period: periodKey,
        remainingCredits: Math.max(0, remaining),
        spentThisPeriod,
        monthlyAllowance,
        upgradeUrl: `${env.APP_URL}/pricing`,
        href: "/settings",
      },
      {
        dedupeKey: `${threshold === 100 ? "credits_exhausted" : "credits_low"}:${periodKey}`,
      }
    ).catch((err) => {
      console.error(`[Billing] Failed to send ${threshold}% alert:`, err);
    });

    return true;
  };

  if (reached80) {
    notified80 = await notifyThreshold(80);
  }
  if (reached100) {
    notified100 = await notifyThreshold(100);
  }

  return { notified80, notified100 };
}

/**
 * Reserves credits for any workspace generation against the workspace owner's CreditAccount:
 * 1. Resolves owner's CreditAccount (never the collaborator's).
 * 2. Enforces the collaborator's monthly credit cap (`402` if exceeded).
 * 3. Reserves credits atomically; if the owner is out of credits:
 *    - Collaborators receive the neutral message "The workspace owner has no credits left" (402).
 *    - The owner receives a deduplicated notification.
 * 4. Checks 80% / 100% allowance thresholds on the owner's account.
 */
export async function reserveForWorkspaceGeneration(opts: {
  workspace: WorkspaceBillingTarget;
  actorId: string;
  amount: number;
  reservationKey: string;
  generationId: string;
  estimated?: boolean;
}): Promise<BalanceResult & { billedAccountId: string; ownerId: string }> {
  const ws = await normalizeWorkspaceTarget(opts.workspace);
  const { billedAccountId, ownerId } = await resolveBilledAccount(ws);
  const isCollaborator = opts.actorId !== ownerId;

  // A retry of a reservation that already went through must not be re-checked
  // against the cap: reserve() returns the recorded result for the same key.
  const alreadyReserved = await db.creditLedger.findUnique({
    where: { idempotencyKey: opts.reservationKey },
    select: { id: true },
  });

  // 1. Collaborator monthly spend cap.
  // The cap counts everything the member spends from this owner's credits this
  // month, across all of the owner's workspaces (Step 7.5), not just this one.
  const cap =
    isCollaborator && !alreadyReserved
      ? await resolveMemberMonthlyCreditCap(opts.actorId, ws)
      : null;
  const assertWithinCap = (usedThisMonth: number) => {
    if (cap !== null && usedThisMonth + opts.amount > cap) {
      throw new ApiError(
        402,
        "collaborator_cap_exceeded",
        `You've reached your monthly limit of ${cap} credits for this owner's workspaces.`,
        { cap, used: usedThisMonth }
      );
    }
  };
  if (cap !== null) {
    // Fast pre-check so an over-cap member gets the cap message even when the
    // owner is also out of credits.
    assertWithinCap(await getMemberMonthlySpend(opts.actorId, billedAccountId));
  }

  // 2. Reserve on the OWNER's CreditAccount
  let balance: BalanceResult;
  try {
    balance = await reserve(billedAccountId, opts.amount, opts.reservationKey, {
      generationId: opts.generationId,
      actorId: opts.actorId,
      estimated: opts.estimated ?? true,
      // Authoritative check, made while the owner's account row is locked so
      // concurrent generations can't each pass the pre-check and overspend.
      guard:
        cap !== null
          ? async (tx) =>
              assertWithinCap(
                await getMemberMonthlySpend(
                  opts.actorId,
                  billedAccountId,
                  getCurrentBillingPeriodStart(),
                  tx
                )
              )
          : undefined,
    });
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status === 402 && err.code !== "collaborator_cap_exceeded") {
      await checkAndNotifyOwnerAllowanceThresholds({
        ownerId,
        accountId: billedAccountId,
        workspaceId: ws.id,
        remainingBalance: 0,
        force100: true,
      }).catch(() => {});

      if (isCollaborator) {
        // Neutral message for collaborators — never reveal the owner's balance
        throw Errors.paymentRequired(OWNER_OUT_OF_CREDITS_MESSAGE);
      }
    }
    throw err;
  }

  // 3. Check 80% / 100% allowance thresholds after reservation. Runs in the
  // background: it never affects the generation, so it shouldn't delay it.
  const remainingAfter = balance.planBalance + balance.topupBalance;
  const thresholdCheck = checkAndNotifyOwnerAllowanceThresholds({
    ownerId,
    accountId: billedAccountId,
    workspaceId: ws.id,
    remainingBalance: remainingAfter,
  })
    .catch(() => {})
    .finally(() => pendingThresholdChecks.delete(thresholdCheck));
  pendingThresholdChecks.add(thresholdCheck);

  return {
    ...balance,
    billedAccountId,
    ownerId,
  };
}

/**
 * Returns credit usage broken down by member (collaborator or owner)
 * against the owner's CreditAccount for the current billing period.
 */
export async function getUsageByMember(
  ownerId: string,
  opts?: { periodStart?: Date; workspaceId?: string }
) {
  const account = await getAccountByUserId(ownerId);
  if (!account) {
    return [];
  }

  const periodStart = opts?.periodStart ?? getCurrentBillingPeriodStart();

  const rows = opts?.workspaceId
    ? await db.$queryRaw<
        Array<{
          actor_id: string;
          charged: bigint | number | null;
          gen_count: bigint | number | null;
        }>
      >`
        SELECT
          actor_id,
          COALESCE(
            SUM(
              CASE
                WHEN status = 'RUNNING'::"GenStatus" AND charged_credits = 0 THEN reserved_credits
                ELSE charged_credits
              END
            ),
            0
          ) AS charged,
          COUNT(*) AS gen_count
        FROM generations
        WHERE billed_account_id = ${account.id}
          AND workspace_id = ${opts.workspaceId}
          AND created_at >= ${periodStart}
          AND status IN ('COMPLETED'::"GenStatus", 'RUNNING'::"GenStatus", 'CANCELLED'::"GenStatus")
        GROUP BY actor_id
        ORDER BY charged DESC
      `
    : await db.$queryRaw<
        Array<{
          actor_id: string;
          charged: bigint | number | null;
          gen_count: bigint | number | null;
        }>
      >`
        SELECT
          actor_id,
          COALESCE(
            SUM(
              CASE
                WHEN status = 'RUNNING'::"GenStatus" AND charged_credits = 0 THEN reserved_credits
                ELSE charged_credits
              END
            ),
            0
          ) AS charged,
          COUNT(*) AS gen_count
        FROM generations
        WHERE billed_account_id = ${account.id}
          AND created_at >= ${periodStart}
          AND status IN ('COMPLETED'::"GenStatus", 'RUNNING'::"GenStatus", 'CANCELLED'::"GenStatus")
        GROUP BY actor_id
        ORDER BY charged DESC
      `;

  const actorIds = rows.map((r) => r.actor_id).filter(Boolean);
  const users =
    actorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            displayUsername: true,
            image: true,
          },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((r) => {
    const u = userMap.get(r.actor_id);
    return {
      userId: r.actor_id,
      name: u?.name ?? "Deleted user",
      email: u?.email ?? "",
      username: u?.username || u?.displayUsername || null,
      image: u?.image ?? null,
      chargedCredits: Number(r.charged ?? 0),
      generationCount: Number(r.gen_count ?? 0),
      isOwner: r.actor_id === ownerId,
    };
  });
}
