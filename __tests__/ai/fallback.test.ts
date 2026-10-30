/**
 * @jest-environment node
 */
import { streamAi } from "@/server/ai/index";
import { AiError, AiProvider, GenerateRequest, StreamEvent } from "@/server/ai/types";

describe("Step 2.1 — AI Fallback Chain (Pre-Token vs Post-Token)", () => {
  const sampleRequest: GenerateRequest = {
    modelKey: "text-standard",
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "Explain quantum computing" }],
      },
    ],
  };

  it("triggers pre-token fallback when primary model fails with a retryable error", async () => {
    let attemptedPrimary = false;
    let attemptedFallback = false;

    const mockProvider: AiProvider = {
      id: "gemini",
      async *stream(req) {
        if (req.modelKey.includes("standard") || req.modelKey.includes("pro")) {
          attemptedPrimary = true;
          // Primary model fails with a 503 unavailable before emitting any tokens
          throw new AiError("unavailable", true, "High demand on standard model");
        } else {
          attemptedFallback = true;
          // Fallback model emits tokens normally
          yield { type: "text_delta", text: "Quantum computing uses qubits..." };
          yield { type: "done", finishReason: "stop" };
        }
      },
    };

    const events: StreamEvent[] = [];
    for await (const event of streamAi(sampleRequest, {
      userPlan: "LITE",
      providerInstance: mockProvider,
    })) {
      events.push(event);
    }

    expect(attemptedPrimary).toBe(true);
    expect(attemptedFallback).toBe(true);
    expect(events.length).toBe(2);
    expect(events[0]).toEqual({
      type: "text_delta",
      text: "Quantum computing uses qubits...",
    });
    expect(events[1]).toEqual({ type: "done", finishReason: "stop" });
  });

  it("does NOT fallback if a token has already been emitted before error occurs", async () => {
    let attemptedFallback = false;

    const mockProvider: AiProvider = {
      id: "gemini",
      async *stream(req) {
        if (req.modelKey.includes("standard") || req.modelKey.includes("pro")) {
          // Emits one token first
          yield { type: "text_delta", text: "Quantum " };
          // Then crashes with a retryable 503
          throw new AiError("unavailable", true, "Connection dropped mid-stream");
        } else {
          attemptedFallback = true;
          yield { type: "text_delta", text: "Fallback text" };
        }
      },
    };

    const stream = streamAi(sampleRequest, {
      userPlan: "LITE",
      providerInstance: mockProvider,
    });

    const receivedEvents: StreamEvent[] = [];
    let caughtError: any = null;

    try {
      for await (const event of stream) {
        receivedEvents.push(event);
      }
    } catch (err) {
      caughtError = err;
    }

    // Must have received the first token
    expect(receivedEvents.length).toBe(1);
    expect((receivedEvents[0] as any).text).toBe("Quantum ");

    // Must NOT have attempted fallback because output was already streamed
    expect(attemptedFallback).toBe(false);

    // Error must be rethrown
    expect(caughtError).toBeInstanceOf(AiError);
    expect(caughtError.category).toBe("unavailable");
  });

  it("does NOT fallback if error is non-retryable (e.g. invalid_request or auth)", async () => {
    let attemptedFallback = false;

    const mockProvider: AiProvider = {
      id: "gemini",
      async *stream(req) {
        if (req.modelKey.includes("standard") || req.modelKey.includes("pro")) {
          throw new AiError("invalid_request", false, "Invalid argument parameters");
        } else {
          attemptedFallback = true;
        }
      },
    };

    const stream = streamAi(sampleRequest, {
      userPlan: "LITE",
      providerInstance: mockProvider,
    });

    await expect(async () => {
      for await (const _event of stream) {
        // no-op
      }
    }).rejects.toThrow("Invalid argument parameters");

    expect(attemptedFallback).toBe(false);
  });
});
