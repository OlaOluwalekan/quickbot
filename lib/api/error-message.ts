/**
 * Maps server/API error codes to localized error messages.
 * Keeps English `message` for logs/devs, but provides translated user copy.
 */

export interface ApiErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export function getApiErrorMessage(
  err: unknown,
  t: (key: string) => string
): string {
  if (!err) {
    try {
      return t("Errors.api.generic");
    } catch {
      return "An unexpected error occurred. Please try again.";
    }
  }

  if (typeof err === "object" && err !== null) {
    const errorObj = err as Record<string, unknown>;
    // Check code directly, or nested error.code
    const code =
      typeof errorObj.code === "string"
        ? errorObj.code
        : typeof (errorObj.error as Record<string, unknown> | undefined)?.code === "string"
        ? (errorObj.error as Record<string, unknown>).code as string
        : undefined;

    if (code) {
      try {
        const translated = t(`Errors.api.${code}`);
        if (translated && !translated.startsWith("Errors.api.")) {
          return translated;
        }
      } catch {
        // Fall back to generic
      }
    }
  }

  try {
    return t("Errors.api.generic");
  } catch {
    return "An unexpected error occurred. Please try again.";
  }
}
