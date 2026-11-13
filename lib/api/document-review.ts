import { createParser } from "eventsource-parser";

export interface ReviewFindingEvent {
  annotationId: string;
  messageId: string;
  anchor: {
    exact: string;
    prefix: string;
    suffix: string;
    start?: number;
    end?: number;
  };
  category: string;
  severity: string;
  comment: string;
  suggestion?: {
    exact?: string;
    prefix?: string;
    suffix?: string;
    replacement?: string;
    category?: string;
    severity?: string;
  } | null;
  suggestionState?: "PENDING" | "ACCEPTED" | "REJECTED" | null;
  authorType: "AI";
  visibility: "PRIVATE" | "WORKSPACE";
}

export interface ReviewSummaryEvent {
  total: number;
  byCategory: Record<string, number>;
}

export interface ReviewProgressEvent {
  stage: string;
  section: number;
  totalSections: number;
  message: string;
}

export type DocumentReviewHandlers = {
  onProgress?: (progress: ReviewProgressEvent) => void;
  onFinding?: (finding: ReviewFindingEvent) => void;
  onSummary?: (summary: ReviewSummaryEvent) => void;
  onDone?: (data: { generationId?: string; total: number }) => void;
  onError?: (err: { message: string }) => void;
};

export async function streamDocumentReview(
  versionId: string,
  input: {
    instruction?: string;
    preset?: "errors" | "consistency" | "clarity" | "custom";
    visibility?: "PRIVATE" | "WORKSPACE";
    idempotencyKey?: string;
  },
  handlers: DocumentReviewHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(
    `/api/v1/response-versions/${encodeURIComponent(versionId)}/review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    }
  );

  if (!res.ok) {
    let errMessage = res.statusText || `Request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errMessage = errJson.error.message;
      }
    } catch {
      // ignore
    }
    handlers.onError?.({ message: errMessage });
    return;
  }

  if (!res.body) {
    handlers.onError?.({ message: "No response body" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  const parser = createParser({
    onEvent: (event) => {
      if (!event.data) return;
      try {
        const data = JSON.parse(event.data);
        switch (event.event) {
          case "progress":
            handlers.onProgress?.(data);
            break;
          case "finding":
            handlers.onFinding?.(data);
            break;
          case "summary":
            handlers.onSummary?.(data);
            break;
          case "done":
            handlers.onDone?.(data);
            break;
          case "error":
            handlers.onError?.(data);
            break;
        }
      } catch {
        // ignore parse error
      }
    },
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } catch (err: unknown) {
    if (signal?.aborted) return;
    handlers.onError?.({
      message: err instanceof Error ? err.message : "Review connection dropped",
    });
  }
}
