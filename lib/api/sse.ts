import { createParser } from "eventsource-parser";
import { CreateGenerationInput } from "@/lib/schemas/generation";

export type GenerationSSEHandlers = {
  onStarted?: (data: {
    generationId: string;
    responseId: string;
    versionId: string;
  }) => void;
  onStatus?: (data: { stage: string; truncated?: boolean }) => void;
  onThought?: (data: { text: string }) => void;
  onDelta?: (data: { text: string }) => void;
  onUsage?: (data: {
    inputTokens: number;
    outputTokens: number;
    credits: number;
  }) => void;
  onCompleted?: (data: {
    responseId: string;
    versionId: string;
    content: string;
  }) => void;
  onError?: (data: { code: string; message?: string }) => void;
};

/**
 * Streams generation events using fetch + eventsource-parser.
 * Auto-retries on network drop using the same idempotencyKey and polls GET /api/v1/generations/:id.
 */
export async function streamGeneration(
  workspaceId: string,
  body: CreateGenerationInput,
  handlers: GenerationSSEHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;
  let generationId: string | null = null;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(
        `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/generations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
        }
      );

      if (!res.ok) {
        let errData;
        try {
          errData = await res.json();
        } catch {
          errData = {
            error: { code: `http_${res.status}`, message: res.statusText },
          };
        }
        handlers.onError?.({
          code: errData?.error?.code || `http_${res.status}`,
          message: errData?.error?.message || res.statusText,
        });
        return;
      }

      if (!res.body) {
        throw new Error("Missing response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const parser = createParser({
        onEvent: (event) => {
          if (!event.data) return;
          try {
            const data = JSON.parse(event.data);
            switch (event.event) {
              case "started":
                generationId = data.generationId;
                handlers.onStarted?.(data);
                break;
              case "status":
                handlers.onStatus?.(data);
                break;
              case "thought":
                handlers.onThought?.(data);
                break;
              case "delta":
                handlers.onDelta?.(data);
                break;
              case "usage":
                handlers.onUsage?.(data);
                break;
              case "completed":
                handlers.onCompleted?.(data);
                break;
              case "error":
                handlers.onError?.(data);
                break;
            }
          } catch {
            // Ignore non-json or ping comments
          }
        },
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }

      // Stream completed cleanly
      return;
    } catch (err: unknown) {
      if (signal?.aborted) {
        return;
      }

      attempt++;

      // If we have a generationId, attempt status recovery
      if (generationId) {
        try {
          const statusRes = await fetch(
            `/api/v1/generations/${encodeURIComponent(generationId)}`,
            { signal }
          );
          if (statusRes.ok) {
            const statusJson = await statusRes.json();
            const gen = statusJson.data || statusJson;
            if (gen.status === "COMPLETED") {
              handlers.onCompleted?.({
                responseId: gen.responseId,
                versionId: gen.versionId,
                content: gen.content,
              });
              return;
            }
          }
        } catch {
          // Recovery check failed, continue retry loop
        }
      }

      if (attempt >= maxRetries) {
        handlers.onError?.({
          code: "network_error",
          message: err instanceof Error ? err.message : "Network failure",
        });
        throw err;
      }

      // Backoff before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
