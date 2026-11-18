import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";
import { DEFAULT_LOCALE, LOCALE_CODES, type LocaleCode } from "./locales";

export type Messages = Record<string, unknown>;

/**
 * The message bundle of each registered locale (`i18n/locales.ts`). A new
 * locale adds its file here; until then it renders with English.
 */
const BUNDLES: Partial<Record<LocaleCode, Messages>> = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
};

/** `source` on top of `base`: keys missing from `source` keep `base`'s value. */
export function deepMergeMessages(base: Messages, source: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(source)) {
    const prev = out[key];
    out[key] =
      isPlainObject(value) && isPlainObject(prev)
        ? deepMergeMessages(prev, value)
        : value;
  }
  return out;
}

function isPlainObject(v: unknown): v is Messages {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Any code (or `null`) → a registered locale; unknown codes give the default. */
export function resolveLocaleCode(code: string | null | undefined): LocaleCode {
  const short = (code ?? "").toLowerCase().slice(0, 2);
  return (LOCALE_CODES as readonly string[]).includes(short)
    ? (short as LocaleCode)
    : DEFAULT_LOCALE;
}

const merged = new Map<string, Messages>();

/**
 * Messages for a locale, with English filling every key it lacks (beta
 * locales ship partly translated). Cached per locale.
 */
export function messagesFor(code: string | null | undefined): Messages {
  const locale = resolveLocaleCode(code);
  const cached = merged.get(locale);
  if (cached) return cached;
  const en = BUNDLES[DEFAULT_LOCALE] as Messages;
  const own = BUNDLES[locale];
  const result = locale === DEFAULT_LOCALE || !own ? en : deepMergeMessages(en, own);
  merged.set(locale, result);
  return result;
}
