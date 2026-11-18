import {
  LOCALES,
  LOCALE_CODES,
  DEFAULT_LOCALE,
  type LocaleCode,
} from "./locales";

export const locales = LOCALE_CODES;
export type Locale = LocaleCode;

export const defaultLocale: Locale = DEFAULT_LOCALE;
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeNames: Record<Locale, string> = Object.fromEntries(
  LOCALES.map((l) => [l.code, l.nativeName])
) as Record<Locale, string>;
