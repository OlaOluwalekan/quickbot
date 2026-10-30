/**
 * @jest-environment node
 */
import { normalizeGeminiError } from "@/server/ai/errors";
import { AiError } from "@/server/ai/types";

describe("Step 2.1 — AI Error Normalization", () => {
  it("normalizes 429 and RESOURCE_EXHAUSTED into retryable rate_limit", () => {
    const err429 = normalizeGeminiError({ status: 429, message: "Resource exhausted: quota exceeded" });
    expect(err429).toBeInstanceOf(AiError);
    expect(err429.category).toBe("rate_limit");
    expect(err429.retryable).toBe(true);
    expect(err429.safeMessage).not.toContain("Resource exhausted"); // Never leaks raw text

    const errQuota = normalizeGeminiError(new Error("User quota limit reached (RESOURCE_EXHAUSTED)"));
    expect(errQuota.category).toBe("rate_limit");
    expect(errQuota.retryable).toBe(true);
  });

  it("normalizes 503, high demand, and overloaded into retryable unavailable", () => {
    const err503 = normalizeGeminiError({ status: 503, message: "Service Unavailable" });
    expect(err503.category).toBe("unavailable");
    expect(err503.retryable).toBe(true);

    const errOverloaded = normalizeGeminiError(new Error("Model is overloaded with high demand"));
    expect(errOverloaded.category).toBe("unavailable");
    expect(errOverloaded.retryable).toBe(true);
  });

  it("normalizes 400 and INVALID_ARGUMENT into non-retryable invalid_request", () => {
    const err400 = normalizeGeminiError({ status: 400, message: "INVALID_ARGUMENT: contents cannot be empty" });
    expect(err400.category).toBe("invalid_request");
    expect(err400.retryable).toBe(false);
  });

  it("normalizes 401, 403, and PERMISSION_DENIED into non-retryable auth without leaking keys", () => {
    const err401 = normalizeGeminiError({
      status: 401,
      message: "API key not valid. Please pass a valid API key: mock_gemini_key_secret_12345",
    });
    expect(err401.category).toBe("auth");
    expect(err401.retryable).toBe(false);
    expect(err401.safeMessage).not.toContain("mock_gemini_key_secret"); // Never leaks API secrets!
  });

  it("normalizes SAFETY finish reason into non-retryable safety", () => {
    const errSafety = normalizeGeminiError(new Error("SAFETY: Response blocked by safety filters"));
    expect(errSafety.category).toBe("safety");
    expect(errSafety.retryable).toBe(false);
  });

  it("normalizes timeouts and AbortError into retryable timeout", () => {
    const errTimeout = normalizeGeminiError({ code: "DEADLINE_EXCEEDED", message: "Request timed out" });
    expect(errTimeout.category).toBe("timeout");
    expect(errTimeout.retryable).toBe(true);

    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    const errAbort = normalizeGeminiError(abortErr);
    expect(errAbort.category).toBe("timeout");
    expect(errAbort.retryable).toBe(true);
  });

  it("normalizes unrecognized errors into unknown category", () => {
    const errRandom = normalizeGeminiError(new Error("Something completely unforeseen happened"));
    expect(errRandom.category).toBe("unknown");
    expect(errRandom.retryable).toBe(false);
  });

  it("passes existing AiError instances through directly", () => {
    const custom = new AiError("safety", false, "Custom safe message");
    expect(normalizeGeminiError(custom)).toBe(custom);
  });
});
