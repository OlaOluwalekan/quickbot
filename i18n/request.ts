import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, Locale, LOCALE_COOKIE, locales } from "./config";
import { getActor } from "@/server/auth/session";
import { db } from "@/server/db/client";

function isValidLocale(val: string | undefined): val is Locale {
  return Boolean(val && locales.includes(val as Locale));
}

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
          messages: (await import(`../messages/${pref.uiLocale}.json`)).default,
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
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
