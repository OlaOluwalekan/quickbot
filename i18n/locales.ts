export type LocaleCode = "en" | "es" | "fr";
export type LocaleStatus = "live" | "beta";

export interface LocaleDefinition {
  code: LocaleCode;
  name: string;
  nativeName: string;
  hreflang: string;
  ogLocale: string;
  dir: "ltr" | "rtl";
  status: LocaleStatus;
}

export const LOCALES: readonly LocaleDefinition[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    hreflang: "en",
    ogLocale: "en_US",
    dir: "ltr",
    status: "live",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    hreflang: "es",
    ogLocale: "es_ES",
    dir: "ltr",
    status: "live",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    hreflang: "fr",
    ogLocale: "fr_FR",
    dir: "ltr",
    status: "live",
  },
] as const;

export const LOCALE_CODES = LOCALES.map((l) => l.code) as readonly LocaleCode[];
export const DEFAULT_LOCALE: LocaleCode = "en";

export function getLocaleDefinition(code: string): LocaleDefinition {
  const found = LOCALES.find((l) => l.code === code);
  return (found || LOCALES[0]) as LocaleDefinition;
}

export function isValidLocaleCode(code: string | undefined): code is LocaleCode {
  return Boolean(code && LOCALES.some((l) => l.code === code));
}

export function getAlternateOgLocales(currentCode: string): string[] {
  return LOCALES.filter((l) => l.code !== currentCode).map((l) => l.ogLocale);
}
