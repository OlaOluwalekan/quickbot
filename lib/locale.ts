export const UI_LOCALES = ["en", "es", "fr"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const AI_LANGUAGES = [
  "en",
  "es",
  "fr",
  "pt",
  "de",
  "it",
  "nl",
  "ar",
  "hi",
  "bn",
  "sw",
  "yo",
  "ig",
  "ha",
  "zh",
  "ja",
  "ko",
  "ru",
  "tr",
  "id",
] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "en";
export const DEFAULT_AI_LANGUAGE: AiLanguage = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isUiLocale(val: unknown): val is UiLocale {
  return typeof val === "string" && (UI_LOCALES as readonly string[]).includes(val);
}

export function isAiLanguage(val: unknown): val is AiLanguage {
  return typeof val === "string" && (AI_LANGUAGES as readonly string[]).includes(val);
}

/**
 * Detects the UI locale from headers.
 * Order:
 * 1) Cookie (NEXT_LOCALE)
 * 2) Accept-Language weighted q-values
 * 3) Default fallback ("en")
 *
 * Country is NOT used for silent switching (to respect travelers/VPNs).
 */
export function detectUiLocale(h: Headers, _country?: string | null): UiLocale {
  // 1) Check cookie header
  const cookieHeader = h.get("cookie") || "";
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  if (cookieMatch && cookieMatch[1] && isUiLocale(cookieMatch[1])) {
    return cookieMatch[1];
  }

  // 2) Parse Accept-Language header
  const acceptLanguage = h.get("accept-language") || "";
  if (acceptLanguage) {
    const candidates = acceptLanguage
      .split(",")
      .map((entry) => {
        const [langPart, qPart] = entry.split(";");
        const code = langPart?.trim().split("-")[0]?.toLowerCase();
        let q = 1.0;
        if (qPart) {
          const match = qPart.match(/q=([\d.]+)/);
          if (match && match[1]) {
            const parsed = parseFloat(match[1]);
            if (!isNaN(parsed)) q = parsed;
          }
        }
        return { code, q };
      })
      .sort((a, b) => b.q - a.q);

    for (const item of candidates) {
      if (item.code && isUiLocale(item.code)) {
        return item.code;
      }
    }
  }

  // 3) Default
  return DEFAULT_UI_LOCALE;
}

/**
 * Resolves the baseline AI response language based on saved user preferences.
 * Precedence: saved aiLanguage > uiLocale > "en".
 */
export function resolveAiLanguage(p: {
  aiLanguage?: string | null;
  uiLocale?: string | null;
}): string {
  return p.aiLanguage ?? p.uiLocale ?? DEFAULT_AI_LANGUAGE;
}

/**
 * Resolves effective AI language for a generation turn:
 * Precedence (Decision D-13):
 * 1) Prompt override (explicit parameter from composer / language chip)
 * 2) Saved AI language preference
 * 3) UI locale
 * 4) Default "en"
 *
 * Note: Prompt text instructions (e.g., "Reply in Yoruba") take absolute precedence
 * at prompt execution time via the system prompt contract.
 */
export function resolveEffectiveAiLanguage(p: {
  promptOverride?: string | null;
  savedAiLanguage?: string | null;
  uiLocale?: string | null;
}): string {
  if (p.promptOverride) return p.promptOverride;
  if (p.savedAiLanguage) return p.savedAiLanguage;
  if (p.uiLocale) return p.uiLocale;
  return DEFAULT_AI_LANGUAGE;
}

// Francophone country codes (ISO 3166-1 alpha-2)
const FRENCH_COUNTRIES = new Set([
  "FR", "BE", "CH", "LU", "MC", "SN", "CI", "CM", "CD", "CG",
  "ML", "NE", "BF", "TG", "BJ", "GA", "MG", "HT", "GN", "CA",
]);

// Hispanophone country codes (ISO 3166-1 alpha-2)
const SPANISH_COUNTRIES = new Set([
  "ES", "MX", "CO", "AR", "PE", "VE", "CL", "GT", "EC", "CU",
  "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR",
]);

/**
 * Computes language suggestion banner based on geo header (x-vercel-ip-country / cf-ipcountry).
 * Only suggests if the country matches a supported locale other than the current locale.
 */
export function getCountryLanguageSuggestion(
  country?: string | null,
  currentLocale?: string | null
): UiLocale | null {
  if (!country) return null;
  const upper = country.trim().toUpperCase();

  let candidate: UiLocale | null = null;
  if (FRENCH_COUNTRIES.has(upper)) {
    candidate = "fr";
  } else if (SPANISH_COUNTRIES.has(upper)) {
    candidate = "es";
  }

  if (candidate && candidate !== currentLocale) {
    return candidate;
  }
  return null;
}
