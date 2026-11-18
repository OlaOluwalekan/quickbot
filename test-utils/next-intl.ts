/**
 * A `next-intl` mock for component tests that resolves keys from the real
 * English messages, so tests assert on the copy users actually see.
 *
 * Usage (inside a test file):
 *   jest.mock("next-intl", () => jest.requireActual("../test-utils/next-intl").nextIntlMock);
 */
import { IntlMessageFormat } from "intl-messageformat";
import enMessages from "../messages/en.json";

type Values = Record<string, unknown>;

function lookup(path: string): unknown {
  let cur: unknown = enMessages;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function createTranslator(namespace?: string) {
  const full = (key: string) => (namespace ? `${namespace}.${key}` : key);
  const t = (key: string, values?: Values): string => {
    const message = lookup(full(key));
    if (typeof message !== "string") return full(key);
    try {
      return String(
        new IntlMessageFormat(message, "en").format(values as Record<string, string>)
      );
    } catch {
      return message;
    }
  };
  t.rich = (key: string, values?: Values) => t(key, values);
  t.raw = (key: string) => lookup(full(key));
  t.has = (key: string) => lookup(full(key)) !== undefined;
  return t;
}

/** Real `Intl` formatting in English, like next-intl's `useFormatter()`. */
export function createFormatter() {
  return {
    dateTime: (date: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en", options).format(date),
    number: (n: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat("en", options).format(n),
    relativeTime: (date: Date | number, now: Date | number = Date.now()) => {
      const diff = Math.round((Number(date) - Number(now)) / 1000);
      const abs = Math.abs(diff);
      const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      if (abs < 60) return rtf.format(diff, "second");
      if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
      return rtf.format(Math.round(diff / 86400), "day");
    },
  };
}

export const nextIntlMock = {
  useTranslations: (namespace?: string) => createTranslator(namespace),
  useLocale: () => "en",
  useFormatter: () => createFormatter(),
  useNow: () => new Date(),
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
};

/**
 * A mock of `@/i18n/navigation` for component tests that mock `next-intl`
 * (the real helpers need a `NextIntlClientProvider`). It forwards to
 * `next/link` and `next/navigation`, resolved lazily so a test's own
 * `jest.mock("next/navigation")` still applies.
 *
 *   jest.mock("@/i18n/navigation", () => jest.requireActual("../test-utils/next-intl").navigationMock);
 */
/* eslint-disable @typescript-eslint/no-require-imports -- `require` (not requireActual) so each test's own mock of next/navigation applies */
export const navigationMock = {
  __esModule: true,
  get Link() {
    return jest.requireActual("next/link").default;
  },
  usePathname: () => require("next/navigation").usePathname(),
  useRouter: () => require("next/navigation").useRouter(),
  redirect: (href: string) => require("next/navigation").redirect(href),
  getPathname: ({ href }: { href: string }) => href,
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * A mock of `next-intl/server` for route/metadata tests: `getLocale()` returns
 * `currentLocale()` and `getTranslations()` reads that locale's real messages
 * (English filling gaps, like the app).
 *
 *   let locale = "en";
 *   jest.mock("next-intl/server", () =>
 *     jest.requireActual("../test-utils/next-intl").serverIntlMock(() => locale));
 */
export function serverIntlMock(currentLocale: () => string) {
  const { createTranslator: create } = jest.requireActual("use-intl/core");
  const { messagesFor } = jest.requireActual("../i18n/messages");
  const translations = async (arg?: string | { locale?: string; namespace?: string }) => {
    const opts = typeof arg === "string" ? { namespace: arg } : (arg ?? {});
    const locale = opts.locale ?? currentLocale();
    return create({ locale, messages: messagesFor(locale), namespace: opts.namespace });
  };
  return {
    __esModule: true,
    getLocale: async () => currentLocale(),
    getTranslations: translations,
    getMessages: async () => messagesFor(currentLocale()),
  };
}
