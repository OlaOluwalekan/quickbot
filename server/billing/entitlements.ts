import "server-only";
import * as React from "react";
import { env } from "@/server/env";
import {
  PLANS,
  getUserPlanOverride,
  type PlanKey,
  type PlanLimits,
} from "@/server/billing/plans";
import { MODELS, PLAN_RANKS, type ModelKey } from "@/server/ai/registry";
import {
  entitlementsForPlan as sharedEntitlementsForPlan,
  type EntitlementFeatures,
} from "@/lib/entitlements/shared";

export type Entitlements = {
  plan: PlanKey; // effective plan
  models: ModelKey[]; // allowed model keys
  limits: PlanLimits & { searchesPerDay: number; voiceSecondsPerDay: number };
  features: EntitlementFeatures;
};

/**
 * Pure computation of entitlements for a given plan key.
 * Used by tests, server enforcement, and the pricing page.
 */
export function entitlementsForPlan(plan: PlanKey): Entitlements {
  const normalizedPlan: PlanKey = plan in PLANS ? plan : "FREE";
  const base = sharedEntitlementsForPlan(normalizedPlan);
  const planRank = PLAN_RANKS[normalizedPlan] ?? 0;

  const allowedModels = (Object.keys(MODELS) as ModelKey[]).filter(
    (key) => planRank >= (PLAN_RANKS[MODELS[key].minPlan] ?? 0)
  );

  return {
    ...base,
    plan: normalizedPlan,
    models: allowedModels,
  };
}

let warnedDevDefaultPlanInProduction = false;

function resolveEffectivePlanForUser(
  override: PlanKey | undefined,
  nodeEnv: string,
  rawDevDefaultPlan: string | undefined
): PlanKey {
  if (override && override in PLANS) {
    return override;
  }

  if (rawDevDefaultPlan && rawDevDefaultPlan in PLANS) {
    if (nodeEnv === "production") {
      if (warnedDevDefaultPlanInProduction) return "FREE";
      warnedDevDefaultPlanInProduction = true;
      console.warn(
        `[Entitlements] DEV_DEFAULT_PLAN="${rawDevDefaultPlan}" is set in production and will be ignored. Defaulting to FREE.`
      );
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
    _userId: string,
    override: PlanKey | undefined,
    nodeEnv: string,
    rawDevDefaultPlan: string | undefined
  ): Promise<Entitlements> => {
    const effectivePlan = resolveEffectivePlanForUser(
      override,
      nodeEnv,
      rawDevDefaultPlan
    );
    return entitlementsForPlan(effectivePlan);
  }
);

/**
 * Resolves the effective entitlements for a user.
 * Interim resolution order (until Step 8.1 Subscription table):
 * 1. Test override map (`getUserPlanOverride`)
 * 2. `env.DEV_DEFAULT_PLAN` (only when `NODE_ENV !== "production"`; ignored with a warning in production)
 * 3. `"FREE"`
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
