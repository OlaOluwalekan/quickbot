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
