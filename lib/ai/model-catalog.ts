/**
 * Isomorphic Model Catalog & Pricing Primitives (§4.4, F4.4)
 * Pure, environment-free module safe to import from both client and server.
 */

export type PlanTier = "FREE" | "LITE" | "STANDARD" | "PRO";
export type PlanKey = PlanTier;

export const PLAN_RANKS: Record<PlanTier, number> = {
  FREE: 0,
  LITE: 1,
  STANDARD: 2,
  PRO: 3,
};

export const CREDIT_USD = 0.002;
export const GROUNDING_SURCHARGE_CREDITS = 3;

/** Typical token usage estimates used to compute per-message credit hints (§2.1) */
export const TYPICAL_INPUT_TOKENS = 2500;
export const TYPICAL_OUTPUT_TOKENS = 1300;

export type ModelKey = "text-economy" | "text-standard" | "image-standard";

export interface ModelCaps {
  vision: boolean;
  documents: boolean;
  thinkingSummaries: boolean;
  tools: boolean;
  grounding: boolean;
}

export interface ModelCatalogEntry {
  key: ModelKey;
  kind: "TEXT" | "IMAGE";
  tier: "ECONOMY" | "STANDARD";
  minPlan: PlanTier;
  maxInput: number;
  caps: ModelCaps;
  priceUsdPerM?: { in: number; out: number };
  priceUsdPerImage?: number;
  typicalCredits: number;
}

export const MODEL_CATALOG: Record<ModelKey, ModelCatalogEntry> = {
  "text-economy": {
    key: "text-economy",
    kind: "TEXT",
    tier: "ECONOMY",
    minPlan: "FREE",
    priceUsdPerM: { in: 0.25, out: 1.5 },
    maxInput: 200_000,
    caps: {
      vision: true,
      documents: true,
      thinkingSummaries: true,
      tools: true,
      grounding: true,
    },
    typicalCredits: 2,
  },
  "text-standard": {
    key: "text-standard",
    kind: "TEXT",
    tier: "STANDARD",
    minPlan: "LITE",
    priceUsdPerM: { in: 1.5, out: 7.5 },
    maxInput: 1_000_000,
    caps: {
      vision: true,
      documents: true,
      thinkingSummaries: true,
      tools: true,
      grounding: true,
    },
    typicalCredits: 7,
  },
  "image-standard": {
    key: "image-standard",
    kind: "IMAGE",
    tier: "STANDARD",
    minPlan: "LITE",
    priceUsdPerImage: 0.067,
    maxInput: 2_000,
    caps: {
      vision: false,
      documents: false,
      thinkingSummaries: false,
      tools: false,
      grounding: false,
    },
    typicalCredits: 35,
  },
} as const;

export function isModelKey(key: string): key is ModelKey {
  return key in MODEL_CATALOG;
}

export function getModelCatalogEntry(key: string): ModelCatalogEntry {
  if (!isModelKey(key)) {
    throw new Error(`Unknown model key: ${key}`);
  }
  return MODEL_CATALOG[key];
}

export interface TokenUsageInput {
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  images?: number;
  grounding?: boolean;
  searches?: number;
}

/**
 * Calculates credits for given token or image usage.
 */
export function creditsFor(modelKey: string, u: TokenUsageInput = {}): number {
  const model = getModelCatalogEntry(modelKey);

  let costUsd = 0;
  if (model.kind === "TEXT" && model.priceUsdPerM) {
    const inputCount = u.inputTokens ?? 0;
    // Thinking tokens are billed as output tokens
    const outputCount = (u.outputTokens ?? 0) + (u.thoughtTokens ?? 0);
    costUsd =
      (inputCount * model.priceUsdPerM.in + outputCount * model.priceUsdPerM.out) /
      1_000_000;
  } else if (model.kind === "IMAGE" && model.priceUsdPerImage !== undefined) {
    const imagesCount = u.images ?? 1;
    costUsd = imagesCount * model.priceUsdPerImage;
  }

  const baseCredits = Math.max(1, Math.ceil(costUsd / CREDIT_USD));
  const searchCount =
    u.searches !== undefined ? u.searches : u.grounding ? 1 : 0;
  const surcharge =
    model.kind === "TEXT" ? searchCount * GROUNDING_SURCHARGE_CREDITS : 0;

  return baseCredits + surcharge;
}

/**
 * Computes typical credit hint text dynamically using next-intl or fallback format.
 */
export function formatModelCreditHint(
  entry: ModelCatalogEntry,
  t?: (key: string, values?: Record<string, unknown>) => string
): string {
  if (t) {
    if (entry.kind === "IMAGE") {
      return t("creditHintImage", { credits: entry.typicalCredits });
    }
    return t("creditHintMessage", { credits: entry.typicalCredits });
  }

  // Fallback if no translation function is provided
  if (entry.kind === "IMAGE") {
    return `≈ ${entry.typicalCredits} per image`;
  }
  return `≈ ${entry.typicalCredits} credits per message`;
}

export interface ClientModelOption {
  key: ModelKey;
  name: string;
  description?: string;
  kind: "TEXT" | "IMAGE";
  tier: "ECONOMY" | "STANDARD";
  minPlan: PlanTier;
  typicalCredits: number;
  creditHint: string;
  supportsThinking?: boolean;
  caps: ModelCaps;
}

/**
 * Returns translated client models for model pickers.
 */
export function getClientModels(
  tModels?: (key: string, values?: Record<string, unknown>) => string,
  kind?: "TEXT" | "IMAGE"
): ClientModelOption[] {
  const entries = Object.values(MODEL_CATALOG).filter(
    (m) => (kind ? m.kind === kind : m.kind === "TEXT")
  );

  return entries.map((m) => ({
    key: m.key,
    name: tModels ? tModels(`${m.key}.name`) : defaultName(m.key),
    description: tModels ? tModels(`${m.key}.description`) : undefined,
    kind: m.kind,
    tier: m.tier,
    minPlan: m.minPlan,
    typicalCredits: m.typicalCredits,
    creditHint: formatModelCreditHint(m, tModels),
    supportsThinking: m.caps.thinkingSummaries,
    caps: m.caps,
  }));
}

function defaultName(key: ModelKey): string {
  switch (key) {
    case "text-economy":
      return "Fast & Efficient";
    case "text-standard":
      return "Standard Reasoning";
    case "image-standard":
      return "Image Studio";
  }
}

/** Static compatibility list with computed credit hints */
export const CLIENT_MODELS: ClientModelOption[] = [
  {
    key: "text-economy",
    name: "Fast & Efficient",
    kind: "TEXT",
    tier: "ECONOMY",
    minPlan: "FREE",
    typicalCredits: 2,
    creditHint: formatModelCreditHint(MODEL_CATALOG["text-economy"]),
    supportsThinking: true,
    caps: MODEL_CATALOG["text-economy"].caps,
  },
  {
    key: "text-standard",
    name: "Standard Reasoning",
    kind: "TEXT",
    tier: "STANDARD",
    minPlan: "LITE",
    typicalCredits: 7,
    creditHint: formatModelCreditHint(MODEL_CATALOG["text-standard"]),
    supportsThinking: true,
    caps: MODEL_CATALOG["text-standard"].caps,
  },
];

export const CLIENT_IMAGE_MODELS: ClientModelOption[] = [
  {
    key: "image-standard",
    name: "Image Studio",
    kind: "IMAGE",
    tier: "STANDARD",
    minPlan: "LITE",
    typicalCredits: 35,
    creditHint: formatModelCreditHint(MODEL_CATALOG["image-standard"]),
    supportsThinking: false,
    caps: MODEL_CATALOG["image-standard"].caps,
  },
];
