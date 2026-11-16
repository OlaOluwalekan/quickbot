/**
 * Maps server/API error codes to localized error messages.
 *
 * The server keeps an English `message` for logs and developers; users see
 * `Errors.api.<code>` when a translation exists for the code, otherwise the
 * caller's `fallback` (usually "Couldn't <do the action>"), otherwise
 * `Errors.api.generic`. The English server message is never shown.
 */

export interface ApiErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

type Translator = ((key: string) => string) & { has?: (key: string) => boolean };

/**
 * An error whose message is already translated for the person using the app.
 * Throw it when a component maps a specific error code itself.
 */
export class LocalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalizedError";
  }
}

/**
 * The error body of a failed `/api/v1/*` response (`{ error: { code, message } }`),
 * as a value that `getApiErrorMessage` understands.
 */
export async function readApiError(res: Response): Promise<ApiErrorLike> {
  try {
    const json = await res.json();
    const error = json?.error;
    if (error && typeof error === "object") return error as ApiErrorLike;
  } catch {
    // Body wasn't JSON: only the status is known.
  }
  return { status: res.status };
}

/** Codes for HTTP statuses that arrive without a code of their own. */
function codeForStatus(status: number): string | undefined {
  if (status === 401) return "unauthorized";
  if (status === 402) return "insufficient_credits";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 413) return "file_too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "internal_error";
  return undefined;
}

/** The stable error code carried by an API error, a `{ error }` body or a stream error. */
export function getApiErrorCode(err: unknown): string | undefined {
  if (typeof err === "string") return /^[A-Za-z_][A-Za-z0-9_]*$/.test(err) ? err : undefined;
  if (typeof err !== "object" || err === null) return undefined;
  const obj = err as Record<string, unknown>;
  const nested = obj.error as Record<string, unknown> | undefined;
  const code =
    typeof obj.code === "string"
      ? obj.code
      : nested && typeof nested.code === "string"
        ? nested.code
        : undefined;
  const http = code?.match(/^http_(\d{3})$/);
  if (http) return codeForStatus(Number(http[1]));
  if (code) return code;
  if (typeof obj.status === "number") return codeForStatus(obj.status);
  return undefined;
}

/** `Errors.api.<code>` when that code has a translation, else undefined. */
export function translateApiErrorCode(
  code: string | undefined,
  t: Translator
): string | undefined {
  return code ? translate(t, `Errors.api.${code}`) : undefined;
}

function translate(t: Translator, key: string): string | undefined {
  try {
    if (t.has && !t.has(key)) return undefined;
    const translated = t(key);
    if (translated && translated !== key && !translated.endsWith(key)) {
      return translated;
    }
  } catch {
    // Missing key: fall through.
  }
  return undefined;
}

/**
 * @param t        a root translator (`useTranslations()`)
 * @param fallback an already-translated message for this action
 */
export function getApiErrorMessage(
  err: unknown,
  t: Translator,
  fallback?: string
): string {
  if (err instanceof LocalizedError) return err.message;

  const translated = translateApiErrorCode(getApiErrorCode(err), t);
  if (translated) return translated;

  if (fallback) return fallback;

  return (
    translate(t, "Errors.api.generic") ??
    "An unexpected error occurred. Please try again."
  );
}

/** The error shape returned by the Better Auth client (`{ error }`). */
export interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

/**
 * Translates a Better Auth error: `Auth.errors.<CODE>` when that code has a
 * translation, a rate-limit message for 429, else the caller's `fallback`.
 * Better Auth's own English `message` is never shown.
 */
export function getAuthErrorMessage(
  err: AuthErrorLike | null | undefined,
  t: Translator,
  fallback: string
): string {
  const code = err?.code;
  if (code && /^[A-Z_]+$/.test(code)) {
    const translated = translate(t, `Auth.errors.${code}`);
    if (translated) return translated;
  }
  if (err?.status === 429) {
    return translate(t, "Errors.api.rate_limited") ?? fallback;
  }
  return fallback;
}
