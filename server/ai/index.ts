import "server-only";
import { AiError, AiProvider, GenerateRequest, ImageRequest, ImageResult, StreamEvent } from "./types";
import { assertModelAccess, getModel, ModelKey, PlanTier } from "./registry";
import { GeminiProvider } from "./providers/gemini";
import { normalizeGeminiError } from "./errors";

export * from "./types";
export * from "./registry";
export * from "./errors";
export * from "./providers/gemini";

const geminiProvider = new GeminiProvider();

/**
 * Returns the appropriate provider instance for a given model key.
 */
export function getProvider(modelKey: string): AiProvider {
  const model = getModel(modelKey);
  switch (model.provider) {
    case "gemini":
      return geminiProvider;
    default:
      throw new AiError(
        "invalid_request",
        false,
        `Provider '${(model as any).provider}' is not supported.`
      );
  }
}

export interface StreamAiOptions {
  userPlan?: PlanTier | string;
  fallbackModelKey?: ModelKey;
  providerInstance?: AiProvider;
}

/**
 * Streams AI completion with automated, safe fallback handling:
 * - Validates plan permissions upfront.
 * - Resolves registry keys to provider-specific model IDs.
 * - Fallback chain executes ONLY when the error is retryable AND no token has been emitted yet.
 */
export async function* streamAi(
  req: GenerateRequest,
  options: StreamAiOptions = {}
): AsyncIterable<StreamEvent> {
  const primaryModel = assertModelAccess(
    req.modelKey,
    options.userPlan ?? "FREE"
  );

  const fallbackCandidate: ModelKey | null =
    options.fallbackModelKey ||
    (req.modelKey === "text-standard" ? "text-economy" : null);

  const provider = options.providerInstance || getProvider(req.modelKey);

  let tokensEmitted = false;
  let activeModelKey = primaryModel.providerModelId;

  try {
    const stream = provider.stream({
      ...req,
      modelKey: activeModelKey,
    });

    for await (const event of stream) {
      if (event.type === "text_delta" || event.type === "thought_delta") {
        tokensEmitted = true;
      }
      yield event;
    }
  } catch (err: unknown) {
    const normalized = normalizeGeminiError(err);

    // If a token was already emitted to the client, we cannot safely switch models
    if (tokensEmitted || !normalized.retryable || !fallbackCandidate) {
      throw normalized;
    }

    // Fallback path: retryable error occurred before the first token was emitted
    console.warn(
      `[AI Engine] Primary model ${req.modelKey} failed (${normalized.category}). Triggering pre-token fallback to ${fallbackCandidate}...`
    );

    const fallbackModel = assertModelAccess(
      fallbackCandidate,
      options.userPlan ?? "FREE"
    );
    activeModelKey = fallbackModel.providerModelId;

    const fallbackStream = provider.stream({
      ...req,
      modelKey: activeModelKey,
    });

    for await (const event of fallbackStream) {
      yield event;
    }
  }
}

/**
 * Generates an image using the registry model and appropriate provider.
 * Returns raw bytes Buffer and mime type, never a data URL stored in the DB.
 */
export async function generateAiImage(
  req: ImageRequest,
  options: { userPlan?: PlanTier | string; providerInstance?: AiProvider } = {}
): Promise<ImageResult> {
  const model = assertModelAccess(req.modelKey, options.userPlan ?? "FREE");
  const provider = options.providerInstance || getProvider(req.modelKey);

  if (!provider.generateImage) {
    throw new AiError(
      "invalid_request",
      false,
      `Provider ${model.provider} does not support image generation.`
    );
  }

  return provider.generateImage({
    ...req,
    modelKey: model.providerModelId,
  });
}
