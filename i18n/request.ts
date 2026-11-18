import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, Locale, LOCALE_COOKIE, locales } from "./config";
import { getActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { IntlErrorCode, type IntlError } from "next-intl";
// English fills any key a (beta) locale lacks.
import { messagesFor } from "./messages";

function isValidLocale(val: string | undefined): val is Locale {
  return Boolean(val && locales.includes(val as Locale));
}

/** A key missing even in English shows the key, and is logged once in dev. */
const fallbackOptions = {
  getMessageFallback: ({ namespace, key }: { namespace?: string; key: string }) =>
    namespace ? `${namespace}.${key}` : key,
  onError: (error: IntlError) => {
    if (error.code === IntlErrorCode.MISSING_MESSAGE) {
      if (process.env.NODE_ENV === "development") console.warn(error.message);
      return;
    }
    console.error(error);
  },
};

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale;

  try {
    // 1) Saved preference (if signed in)
    const actor = await getActor().catch(() => null);
    if (actor?.userId) {
      const pref = await db.userPreference
        .findUnique({
          where: { userId: actor.userId },
          select: { uiLocale: true },
        })
        .catch(() => null);

      if (pref?.uiLocale && isValidLocale(pref.uiLocale)) {
        return {
          locale: pref.uiLocale,
          messages: messagesFor(pref.uiLocale),
          ...fallbackOptions,
        };
      }
    }

    // 2) NEXT_LOCALE cookie
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

    if (isValidLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
      // 3) Accept-Language header
      const headerStore = await headers();
      const acceptLanguage = headerStore.get("accept-language") || "";
      const preferred = acceptLanguage
        .split(",")
        .map((part) => part.split(";")[0]?.trim().slice(0, 2).toLowerCase())
        .find((code) => isValidLocale(code));

      if (isValidLocale(preferred)) {
        locale = preferred;
      }
    }
  } catch {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: messagesFor(locale),
    ...fallbackOptions,
  };
});
