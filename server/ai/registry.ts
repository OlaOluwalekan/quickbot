import "server-only";
import { env } from "@/server/env";
import { AiError } from "./types";

export type PlanTier = "FREE" | "LITE" | "STANDARD" | "PRO";
export type PlanKey = PlanTier;

export const PLAN_RANKS: Record<PlanTier, number> = {
  FREE: 0,
  LITE: 1,
  STANDARD: 2,
  PRO: 3,
};

export const MODELS = {
  "text-economy": {
    provider: "gemini",
    providerModelId: env.GEMINI_TEXT_MODEL_ECONOMY,
    kind: "TEXT",
    tier: "ECONOMY",
    priceUsdPerM: { in: 0.25, out: 1.5 },
    maxInput: 200_000,
    caps: {
      vision: true,
      documents: true,
      thinkingSummaries: true,
      tools: true,
      grounding: true,
    },
    minPlan: "FREE" as PlanTier,
  },
  "text-standard": {
    provider: "gemini",
    providerModelId: env.GEMINI_TEXT_MODEL_STANDARD,
    kind: "TEXT",
    tier: "STANDARD",
    priceUsdPerM: { in: 1.5, out: 7.5 },
    maxInput: 1_000_000,
    caps: {
      vision: true,
      documents: true,
      thinkingSummaries: true,
      tools: true,
      grounding: true,
    },
    minPlan: "LITE" as PlanTier,
  },
  "image-standard": {
    provider: "gemini",
    providerModelId: env.GEMINI_IMAGE_MODEL,
    kind: "IMAGE",
    tier: "STANDARD",
    priceUsdPerImage: 0.067,
    maxInput: 2_000,
    caps: {
      vision: false,
      documents: false,
      thinkingSummaries: false,
      tools: false,
      grounding: false,
    },
    minPlan: "LITE" as PlanTier,
  },
} as const;

export type ModelKey = keyof typeof MODELS;

export const CREDIT_USD = 0.002;

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

export interface TokenUsageInput {
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  images?: number;
}

export function creditsFor(modelKey: string, u: TokenUsageInput): number {
  const model = getModel(modelKey);

  let costUsd = 0;
  if (model.kind === "TEXT" && "priceUsdPerM" in model) {
    const inputCount = u.inputTokens ?? 0;
    // Note: Thinking tokens bill as output tokens
    const outputCount = (u.outputTokens ?? 0) + (u.thoughtTokens ?? 0);
    costUsd =
      (inputCount * model.priceUsdPerM.in + outputCount * model.priceUsdPerM.out) /
      1_000_000;
  } else if (model.kind === "IMAGE" && "priceUsdPerImage" in model) {
    const imagesCount = u.images ?? 1;
    costUsd = imagesCount * model.priceUsdPerImage;
  }

  return Math.max(1, Math.ceil(costUsd / CREDIT_USD));
}
