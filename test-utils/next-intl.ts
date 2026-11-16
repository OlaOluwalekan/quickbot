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

export const nextIntlMock = {
  useTranslations: (namespace?: string) => createTranslator(namespace),
  useLocale: () => "en",
  useFormatter: () => ({
    dateTime: (date: Date) => date.toISOString().slice(0, 10),
    relativeTime: (date: Date) => date.toISOString(),
    number: (n: number) => String(n),
  }),
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
};
