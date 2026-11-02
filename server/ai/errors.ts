import { AiError } from "./types";

/**
 * Normalizes provider errors (specifically Gemini/@google/genai) into strongly-typed AiError instances.
 * Never forwards raw provider error messages directly to users.
 */
export function normalizeGeminiError(error: unknown): AiError {
  if (error instanceof AiError) {
    return error;
  }

  const errObj = error as Record<string, unknown> | null | undefined;
  const status =
    (errObj?.status as number | string) ||
    (errObj?.statusCode as number | string) ||
    (errObj?.code as number | string) ||
    "";

  const rawMsg = String(
    (errObj?.error as Record<string, unknown>)?.message ||
      errObj?.message ||
      (typeof errObj?.body === "string" ? errObj.body : "") ||
      ""
  );

  const statusStr = String(status).toUpperCase();
  const msgLower = rawMsg.toLowerCase();

  // 1. Rate Limit / Quota Exceeded (retryable)
  if (
    statusStr === "429" ||
    statusStr.includes("RESOURCE_EXHAUSTED") ||
    msgLower.includes("resource_exhausted") ||
    msgLower.includes("quota") ||
    msgLower.includes("rate limit")
  ) {
    return new AiError(
      "rate_limit",
      true,
      "AI service rate limit or quota exceeded. Please try again shortly.",
      error
    );
  }

  // 2. Service Unavailable / High Demand (retryable)
  if (
    statusStr === "503" ||
    statusStr === "500" ||
    statusStr === "504" ||
    statusStr.includes("UNAVAILABLE") ||
    msgLower.includes("unavailable") ||
    msgLower.includes("high demand") ||
    msgLower.includes("overloaded")
  ) {
    return new AiError(
      "unavailable",
      true,
      "AI service is currently experiencing high demand. Please try again in a moment.",
      error
    );
  }

  // 3. Timeouts / Abort signals (retryable)
  if (
    statusStr === "408" ||
    statusStr.includes("DEADLINE_EXCEEDED") ||
    msgLower.includes("deadline_exceeded") ||
    msgLower.includes("timeout") ||
    msgLower.includes("abort") ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new AiError(
      "timeout",
      true,
      "The request to the AI model timed out. Please retry.",
      error
    );
  }

  // 4. Content Safety
  if (
    statusStr.includes("SAFETY") ||
    msgLower.includes("safety") ||
    msgLower.includes("blocked")
  ) {
    return new AiError(
      "safety",
      false,
      "The request or response was flagged and blocked by content safety filters.",
      error
    );
  }

  // 5. Auth / API Key Errors (never show raw details to users)
  if (
    statusStr === "401" ||
    statusStr === "403" ||
    statusStr.includes("UNAUTHENTICATED") ||
    statusStr.includes("PERMISSION_DENIED") ||
    msgLower.includes("unauthenticated") ||
    msgLower.includes("permission_denied") ||
    msgLower.includes("api key not valid") ||
    msgLower.includes("apikey")
  ) {
    return new AiError(
      "auth",
      false,
      "AI provider authentication failed. Please verify provider credentials.",
      error
    );
  }

  // 6. Invalid Request
  if (
    statusStr === "400" ||
    statusStr.includes("INVALID_ARGUMENT") ||
    msgLower.includes("invalid_argument") ||
    msgLower.includes("bad request")
  ) {
    return new AiError(
      "invalid_request",
      false,
      "The request parameters were invalid.",
      error
    );
  }

  // 7. Unknown / Fallback
  return new AiError(
    "unknown",
    false,
    "An unexpected error occurred while communicating with the AI service.",
    error
  );
}
