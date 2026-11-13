import { createParser } from "eventsource-parser";
import type { DocumentReviewInput } from "@/lib/schemas/document-review";

export interface ReviewFindingEvent {
  annotationId: string;
  responseId: string;
  versionId: string;
  anchor: { exact: string; prefix: string; suffix: string; start: number; end: number };
  category: string;
  severity: string;
  comment: string;
  replacement: string | null;
}

export interface ReviewSummaryEvent {
  total: number;
  fixes: number;
  byCategory: Record<string, number>;
  /** Part of the text could not be reviewed. */
  incomplete?: boolean;
}

export interface ReviewProgressEvent {
  section: number;
  totalSections: number;
}

export interface ReviewErrorEvent {
  /** Machine-readable reason; the page chooses the message. */
  code: string;
  /** Findings saved before the failure. */
  total?: number;
}

export type DocumentReviewHandlers = {
  onProgress?: (progress: ReviewProgressEvent) => void;
  onFinding?: (finding: ReviewFindingEvent) => void;
  onSummary?: (summary: ReviewSummaryEvent) => void;
  onError?: (err: ReviewErrorEvent) => void;
};

/**
 * Starts a review and reads its events. Resolves when the stream ends; every
 * failure (refused request, dropped connection) is reported through `onError`
 * exactly once.
 */
export async function streamDocumentReview(
  versionId: string,
  input: Omit<DocumentReviewInput, "preset" | "visibility"> &
    Partial<Pick<DocumentReviewInput, "preset" | "visibility">>,
  handlers: DocumentReviewHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(
      `/api/v1/response-versions/${encodeURIComponent(versionId)}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal,
      }
    );
  } catch {
    if (!signal?.aborted) handlers.onError?.({ code: "network" });
    return;
  }

  if (!res.ok || !res.body) {
    let code = `http_${res.status}`;
    try {
      const json = await res.json();
      if (typeof json?.error?.code === "string") code = json.error.code;
    } catch {
      // keep the status code
    }
    handlers.onError?.({ code });
    return;
  }

  let finished = false;
  const parser = createParser({
    onEvent: (event) => {
      if (!event.data) return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (event.event) {
        case "progress":
          handlers.onProgress?.(data as ReviewProgressEvent);
          break;
        case "finding":
          handlers.onFinding?.(data as ReviewFindingEvent);
          break;
        case "summary":
          finished = true;
          handlers.onSummary?.(data as ReviewSummaryEvent);
          break;
        case "error":
          finished = true;
          handlers.onError?.(data as ReviewErrorEvent);
          break;
      }
    },
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } catch {
    // reported below
  }
  if (!finished && !signal?.aborted) handlers.onError?.({ code: "connection" });
}
