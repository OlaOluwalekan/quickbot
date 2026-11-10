import { create } from "zustand";
import { createParser } from "eventsource-parser";

/**
 * Live state of Ask answers that are being generated, keyed by annotation id.
 * The Ask column reads it to show the answer while it streams. Nothing here
 * is persisted: the saved thread is always loaded from the server.
 */
export interface AskStream {
  status: "streaming" | "done" | "failed";
  /** The answer text received so far. */
  text: string;
  /** A follow-up question that was sent with this request (not saved yet). */
  question?: string;
}

interface AskStreamState {
  streams: Record<string, AskStream>;
  set: (annotationId: string, stream: AskStream) => void;
  append: (annotationId: string, text: string) => void;
  clear: (annotationId: string) => void;
}

export const useAskStreamStore = create<AskStreamState>((set) => ({
  streams: {},
  set: (annotationId, stream) =>
    set((state) => ({ streams: { ...state.streams, [annotationId]: stream } })),
  append: (annotationId, text) =>
    set((state) => {
      const current = state.streams[annotationId];
      if (!current) return state;
      return {
        streams: {
          ...state.streams,
          [annotationId]: { ...current, text: current.text + text },
        },
      };
    }),
  clear: (annotationId) =>
    set((state) => {
      if (!(annotationId in state.streams)) return state;
      const streams = { ...state.streams };
      delete streams[annotationId];
      return { streams };
    }),
}));

export interface StreamAskAnswerOptions {
  /** A follow-up question. Omit it to answer the question the Ask was created with. */
  prompt?: string;
  /** Extra fields for the `annotation-changed` event sent when the stream ends. */
  detail?: Record<string, unknown>;
  /** Defaults to one answer per created Ask, even if this is called twice. */
  idempotencyKey?: string;
}

/**
 * Asks the server to answer an Ask thread and publishes the answer to
 * `useAskStreamStore` chunk by chunk. Resolves to `true` when the answer was
 * saved. The stream is always read to the end (the server stops generating
 * when nobody reads).
 *
 * Interim endpoint: F2.5 replaces `/reply` with `/annotations/:id/answer`.
 */
export async function streamAskAnswer(
  annotationId: string,
  options: StreamAskAnswerOptions = {}
): Promise<boolean> {
  const store = useAskStreamStore.getState();
  if (store.streams[annotationId]?.status === "streaming") return false;

  store.set(annotationId, {
    status: "streaming",
    text: "",
    question: options.prompt,
  });

  let ok = false;
  try {
    const res = await fetch(`/api/v1/annotations/${annotationId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key":
          options.idempotencyKey ?? `asknow_${annotationId}`,
      },
      body: JSON.stringify(options.prompt ? { prompt: options.prompt } : {}),
    });
    if (!res.ok || !res.body) throw new Error("ask_stream_failed");

    let failed = false;
    let finished = false;
    const parser = createParser({
      onEvent: (event) => {
        if (event.event === "error") {
          failed = true;
          return;
        }
        if (event.event === "done") {
          finished = true;
          return;
        }
        if (event.event !== "delta" || !event.data) return;
        try {
          const payload = JSON.parse(event.data) as { text?: string };
          if (payload.text) {
            useAskStreamStore.getState().append(annotationId, payload.text);
          }
        } catch {
          // Ignore a malformed chunk; the saved answer is loaded at the end.
        }
      },
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    ok = finished && !failed;
  } catch {
    ok = false;
  }

  const current = useAskStreamStore.getState().streams[annotationId];
  useAskStreamStore.getState().set(annotationId, {
    status: ok ? "done" : "failed",
    text: current?.text ?? "",
    question: current?.question,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("annotation-changed", {
        detail: { ...options.detail, annotationId },
      })
    );
  }
  return ok;
}
