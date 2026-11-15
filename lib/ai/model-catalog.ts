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

export type ModelKey = "text-economy" | "text-standard" | "image-standard" | "audio-transcribe";

export interface ModelCaps {
  vision: boolean;
  documents: boolean;
  thinkingSummaries: boolean;
  tools: boolean;
  grounding: boolean;
}

interface ModelCatalogBase {
  key: ModelKey;
  kind: "TEXT" | "IMAGE";
  tier: "ECONOMY" | "STANDARD";
  minPlan: PlanTier;
  maxInput: number;
  caps: ModelCaps;
  priceUsdPerM?: { in: number; out: number };
  priceUsdPerImage?: number;
}

export interface ModelCatalogEntry extends ModelCatalogBase {
  /** Credits for a typical message (TYPICAL_* tokens) or one image: computed, never typed by hand. */
  typicalCredits: number;
}

const CATALOG_BASE: Record<ModelKey, ModelCatalogBase> = {
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
  },
  "audio-transcribe": {
    key: "audio-transcribe",
    kind: "TEXT",
    tier: "ECONOMY",
    minPlan: "FREE",
    priceUsdPerM: { in: 0.25, out: 1.5 },
    maxInput: 200_000,
    caps: {
      vision: false,
      documents: false,
      thinkingSummaries: false,
      tools: false,
      grounding: false,
    },
  },
};

export function isModelKey(key: string): key is ModelKey {
  return key in CATALOG_BASE;
}

function getCatalogBase(key: string): ModelCatalogBase {
  if (!isModelKey(key)) {
    throw new Error(`Unknown model key: ${key}`);
  }
  return CATALOG_BASE[key];
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
  const model = getCatalogBase(modelKey);

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

/** Credits for one typical message (text) or one image, from the prices above. */
function typicalCreditsFor(key: ModelKey): number {
  return CATALOG_BASE[key].kind === "IMAGE"
    ? creditsFor(key, { images: 1 })
    : creditsFor(key, {
        inputTokens: TYPICAL_INPUT_TOKENS,
        outputTokens: TYPICAL_OUTPUT_TOKENS,
      });
}

export const MODEL_CATALOG: Record<ModelKey, ModelCatalogEntry> = Object.fromEntries(
  (Object.keys(CATALOG_BASE) as ModelKey[]).map((key) => [
    key,
    { ...CATALOG_BASE[key], typicalCredits: typicalCreditsFor(key) },
  ])
) as Record<ModelKey, ModelCatalogEntry>;

export function getModelCatalogEntry(key: string): ModelCatalogEntry {
  if (!isModelKey(key)) {
    throw new Error(`Unknown model key: ${key}`);
  }
  return MODEL_CATALOG[key];
}

type ModelsTranslator = (key: string, values?: Record<string, string | number>) => string;

/** Credit hint for the model picker ("≈ 2 credits per message"), from `Models.*` messages. */
export function formatModelCreditHint(entry: ModelCatalogEntry, t: ModelsTranslator): string {
  return t(entry.kind === "IMAGE" ? "creditHintImage" : "creditHintMessage", {
    credits: entry.typicalCredits,
  });
}

export interface ClientModelOption {
  key: ModelKey;
  name: string;
  description: string;
  kind: "TEXT" | "IMAGE";
  tier: "ECONOMY" | "STANDARD";
  minPlan: PlanTier;
  typicalCredits: number;
  creditHint: string;
  caps: ModelCaps;
}

/**
 * Models of one kind for a picker. Names, descriptions and credit hints come
 * from the `Models` messages (pass `useTranslations("Models")`).
 */
export function getClientModels(
  tModels: ModelsTranslator,
  kind: "TEXT" | "IMAGE" = "TEXT"
): ClientModelOption[] {
  return Object.values(MODEL_CATALOG)
    .filter((m) => m.kind === kind && m.key !== "audio-transcribe")
    .map((m) => ({
      key: m.key,
      name: tModels(`${m.key}.name`),
      description: tModels(`${m.key}.description`),
      kind: m.kind,
      tier: m.tier,
      minPlan: m.minPlan,
      typicalCredits: m.typicalCredits,
      creditHint: formatModelCreditHint(m, tModels),
      caps: m.caps,
    }));
}
