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

function extractCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const obj = err as Record<string, unknown>;
  if (typeof obj.code === "string") return obj.code;
  const nested = obj.error as Record<string, unknown> | undefined;
  if (nested && typeof nested.code === "string") return nested.code;
  return undefined;
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

  const code = extractCode(err);
  if (code) {
    const translated = translate(t, `Errors.api.${code}`);
    if (translated) return translated;
  }

  if (fallback) return fallback;

  return (
    translate(t, "Errors.api.generic") ??
    "An unexpected error occurred. Please try again."
  );
}
