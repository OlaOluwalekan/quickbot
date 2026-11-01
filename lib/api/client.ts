export interface ApiClientErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor({
    status,
    code,
    message,
    details,
    requestId,
  }: ApiClientErrorInit) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export const INSUFFICIENT_CREDITS_EVENT = "insufficient-credits";

export interface InsufficientCreditsDetail {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export function onInsufficientCredits(
  handler: (detail: InsufficientCreditsDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<InsufficientCreditsDetail>;
    handler(customEvent.detail);
  };
  window.addEventListener(INSUFFICIENT_CREDITS_EVENT, listener);
  return () => window.removeEventListener(INSUFFICIENT_CREDITS_EVENT, listener);
}

export const navigationAdapter = {
  redirect(url: string) {
    if (typeof window !== "undefined") {
      window.location.assign(url);
    }
  },
  currentPathWithSearch(): string {
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}`;
  },
};

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  json?: unknown;
}

function isBodyInit(value: unknown): value is BodyInit {
  if (typeof value === "string") return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof FormData !== "undefined" && value instanceof FormData) return true;
  if (
    typeof URLSearchParams !== "undefined" &&
    value instanceof URLSearchParams
  ) {
    return true;
  }
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return true;
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
    return true;
  }
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
    return true;
  }
  return false;
}

export async function api<T = unknown>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const { json, headers: customHeaders, body: rawBody, ...rest } = init;
  const headers = new Headers(customHeaders);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  let body: BodyInit | null | undefined;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  } else if (rawBody !== undefined && rawBody !== null) {
    if (isBodyInit(rawBody)) {
      body = rawBody;
      if (typeof rawBody === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    } else {
      body = JSON.stringify(rawBody);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }
  } else {
    body = rawBody;
  }

  const res = await fetch(path, {
    ...rest,
    headers,
    body,
  });

  const headerRequestId = res.headers?.get?.("x-request-id") ?? undefined;

  if (!res.ok) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const errObj =
      parsed && typeof parsed.error === "object" && parsed.error !== null
        ? (parsed.error as Record<string, unknown>)
        : parsed;

    const code =
      (typeof errObj?.code === "string" && errObj.code) ||
      (res.status === 401
        ? "UNAUTHENTICATED"
        : res.status === 402
          ? "INSUFFICIENT_CREDITS"
          : res.status === 403
            ? "FORBIDDEN"
            : res.status === 404
              ? "NOT_FOUND"
              : "HTTP_ERROR");

    const message =
      (typeof errObj?.message === "string" && errObj.message) ||
      (typeof parsed?.message === "string" && parsed.message) ||
      res.statusText ||
      `Request failed with status ${res.status}`;

    const details = errObj?.details;
    const requestId =
      (typeof errObj?.requestId === "string" && errObj.requestId) ||
      headerRequestId;

    if (res.status === 401 && typeof window !== "undefined") {
      const next = navigationAdapter.currentPathWithSearch();
      navigationAdapter.redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    if (res.status === 402 && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<InsufficientCreditsDetail>(INSUFFICIENT_CREDITS_EVENT, {
          detail: {
            status: res.status,
            code,
            message,
            details,
            requestId,
          },
        }),
      );
    }

    throw new ApiClientError({
      status: res.status,
      code,
      message,
      details,
      requestId,
    });
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const payload = (await res.json()) as unknown;
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}
