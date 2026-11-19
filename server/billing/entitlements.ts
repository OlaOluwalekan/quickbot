import "server-only";
import * as React from "react";
import { env } from "@/server/env";
import { db } from "@/server/db/client";
import {
  PLANS,
  getUserPlanOverride,
  type PlanKey,
  type PlanLimits,
} from "@/server/billing/plans";
import { INTERNAL_MODEL_KEYS, MODELS, PLAN_RANKS, type ModelKey } from "@/server/ai/registry";
import {
  entitlementsForPlan as sharedEntitlementsForPlan,
  type EntitlementFeatures,
} from "@/lib/entitlements/shared";

export type Entitlements = {
  plan: PlanKey; // effective plan
  models: ModelKey[]; // allowed model keys
  limits: PlanLimits & { searchesPerDay: number; voiceSecondsPerDay: number };
  features: EntitlementFeatures;
  /**
   * The subscription is disputed (chargeback): nothing that spends this
   * person's credits may start. `reserve()` enforces it (`billing_frozen`).
   */
  generationBlocked: boolean;
};

/** Subscription fields that decide the effective plan (Step 8.1). */
export type SubscriptionPlanState = {
  plan: PlanKey;
  status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "PAUSED" | "CANCELED" | "EXPIRED" | "DISPUTED";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: Date | null;
};

/** A failed renewal keeps the paid plan this long (counted from the period end). */
export const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Effective plan of a subscription at `now` (Step 8.1):
 * - ACTIVE / TRIALING → its plan (FREE once a scheduled cancellation's period has ended);
 * - PAST_DUE → its plan for a 3-day grace after the period end
 *   (or after the past-due event when no period end is known), then FREE;
 * - CANCELED with `cancelAtPeriodEnd` → its plan until `currentPeriodEnd`, then FREE;
 * - CANCELED otherwise, EXPIRED, PAUSED, DISPUTED → FREE (DISPUTED also blocks generation).
 */
export function resolveSubscriptionPlan(
  sub: SubscriptionPlanState | null | undefined,
  now: Date = new Date()
): { plan: PlanKey; generationBlocked: boolean } {
  if (!sub) return { plan: "FREE", generationBlocked: false };
  const plan: PlanKey = sub.plan in PLANS ? sub.plan : "FREE";
  const periodOver = sub.currentPeriodEnd !== null && now >= sub.currentPeriodEnd;

  switch (sub.status) {
    case "ACTIVE":
    case "TRIALING":
      return { plan: sub.cancelAtPeriodEnd && periodOver ? "FREE" : plan, generationBlocked: false };
    case "PAST_DUE": {
      const since = sub.currentPeriodEnd ?? sub.lastEventAt;
      const inGrace = since === null || now.getTime() < since.getTime() + PAST_DUE_GRACE_MS;
      return { plan: inGrace ? plan : "FREE", generationBlocked: false };
    }
    case "CANCELED":
      return {
        plan: sub.cancelAtPeriodEnd && sub.currentPeriodEnd !== null && !periodOver ? plan : "FREE",
        generationBlocked: false,
      };
    case "DISPUTED":
      return { plan: "FREE", generationBlocked: true };
    case "EXPIRED":
    case "PAUSED":
    default:
      return { plan: "FREE", generationBlocked: false };
  }
}

/**
 * Pure computation of entitlements for a given plan key.
 * Used by tests, server enforcement, and the pricing page.
 */
export function entitlementsForPlan(plan: PlanKey): Entitlements {
  const normalizedPlan: PlanKey = plan in PLANS ? plan : "FREE";
  const base = sharedEntitlementsForPlan(normalizedPlan);
  const planRank = PLAN_RANKS[normalizedPlan] ?? 0;

  const allowedModels = (Object.keys(MODELS) as ModelKey[]).filter(
    (key) =>
      !INTERNAL_MODEL_KEYS.includes(key) &&
      planRank >= (PLAN_RANKS[MODELS[key].minPlan] ?? 0)
  );

  return {
    ...base,
    plan: normalizedPlan,
    models: allowedModels,
    generationBlocked: false,
  };
}

let warnedDevDefaultPlanInProduction = false;

/** Plan when the user has no subscription row: `DEV_DEFAULT_PLAN` outside production, else FREE. */
function fallbackPlan(nodeEnv: string, rawDevDefaultPlan: string | undefined): PlanKey {
  if (rawDevDefaultPlan && rawDevDefaultPlan in PLANS) {
    if (nodeEnv === "production") {
      if (!warnedDevDefaultPlanInProduction) {
        warnedDevDefaultPlanInProduction = true;
        console.warn(
          `[Entitlements] DEV_DEFAULT_PLAN="${rawDevDefaultPlan}" is set in production and will be ignored. Defaulting to FREE.`
        );
      }
      return "FREE";
    }
    return rawDevDefaultPlan as PlanKey;
  }
  return "FREE";
}

// React.cache caches per Server Component request in Next.js.
// Keying on (userId, override, nodeEnv, devDefaultPlan) ensures tests that mutate overrides or env never read stale cache.
const reactCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof React.cache === "function" ? React.cache : (fn) => fn;

const getEntitlementsCached = reactCache(
  async (
    userId: string,
    override: PlanKey | undefined,
    nodeEnv: string,
    rawDevDefaultPlan: string | undefined
  ): Promise<Entitlements> => {
    if (override && override in PLANS) {
      return entitlementsForPlan(override);
    }
    const sub = await db.subscription.findUnique({
      where: { userId },
      select: {
        plan: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        lastEventAt: true,
      },
    });
    if (!sub) {
      return entitlementsForPlan(fallbackPlan(nodeEnv, rawDevDefaultPlan));
    }
    const { plan, generationBlocked } = resolveSubscriptionPlan(sub);
    return { ...entitlementsForPlan(plan), generationBlocked };
  }
);

/**
 * Resolves the effective entitlements for a user. Resolution order:
 * 1. Test override map (`getUserPlanOverride`)
 * 2. The user's `Subscription` row (`resolveSubscriptionPlan`)
 * 3. No subscription: `env.DEV_DEFAULT_PLAN` (only when `NODE_ENV !== "production"`;
 *    ignored with a warning in production), else `"FREE"`
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const override = getUserPlanOverride(userId);
  const nodeEnv = process.env.NODE_ENV || env.NODE_ENV || "development";
  const rawDevDefaultPlan =
    process.env.DEV_DEFAULT_PLAN !== undefined
      ? process.env.DEV_DEFAULT_PLAN || undefined
      : env.DEV_DEFAULT_PLAN;

  return getEntitlementsCached(userId, override, nodeEnv, rawDevDefaultPlan);
}
