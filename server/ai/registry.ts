import "server-only";
import { env } from "@/server/env";
import { AiError } from "./types";
import {
  CREDIT_USD,
  GROUNDING_SURCHARGE_CREDITS,
  MODEL_CATALOG,
  PLAN_RANKS,
  creditsFor as catalogCreditsFor,
  type ModelKey,
  type PlanTier,
  type PlanKey,
  type TokenUsageInput,
} from "@/lib/ai/model-catalog";

export type { PlanTier, PlanKey, ModelKey, TokenUsageInput };
export { PLAN_RANKS, CREDIT_USD, GROUNDING_SURCHARGE_CREDITS };

export const MODELS = {
  "text-economy": {
    ...MODEL_CATALOG["text-economy"],
    provider: "gemini" as const,
    providerModelId: env.GEMINI_TEXT_MODEL_ECONOMY,
  },
  "text-standard": {
    ...MODEL_CATALOG["text-standard"],
    provider: "gemini" as const,
    providerModelId: env.GEMINI_TEXT_MODEL_STANDARD,
  },
  "image-standard": {
    ...MODEL_CATALOG["image-standard"],
    provider: "gemini" as const,
    providerModelId: env.GEMINI_IMAGE_MODEL,
  },
} as const;

export function isModelKey(key: string): key is ModelKey {
  return key in MODELS;
}

export function getModel(modelKey: string) {
  if (!isModelKey(modelKey)) {
    throw new AiError(
      "invalid_request",
      false,
      `Unknown model key: ${modelKey}`
    );
  }
  return MODELS[modelKey];
}

export function assertModelAccess(
  modelKey: string,
  userPlan: PlanTier | string = "FREE"
): (typeof MODELS)[ModelKey] {
  const model = getModel(modelKey);
  const normalizedPlan = (
    userPlan?.toUpperCase() in PLAN_RANKS ? userPlan.toUpperCase() : "FREE"
  ) as PlanTier;

  const userRank = PLAN_RANKS[normalizedPlan] ?? 0;
  const requiredRank = PLAN_RANKS[model.minPlan] ?? 0;

  if (userRank < requiredRank) {
    throw new AiError(
      "invalid_request",
      false,
      `Model '${modelKey}' requires at least a ${model.minPlan} plan.`
    );
  }

  return model;
}

export function creditsFor(modelKey: string, u: TokenUsageInput = {}): number {
  return catalogCreditsFor(modelKey, u);
}
