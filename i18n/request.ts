import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, Locale, LOCALE_COOKIE, locales } from "./config";
import { getActor } from "@/server/auth/session";
import { db } from "@/server/db/client";

function isValidLocale(val: string | undefined): val is Locale {
  return Boolean(val && locales.includes(val as Locale));
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      key in target &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

export async function loadLocaleMessages(locale: string): Promise<Record<string, any>> {
  const enMessages = (await import(`../messages/en.json`)).default;
  if (locale === "en") {
    return enMessages;
  }
  try {
    const targetMessages = (await import(`../messages/${locale}.json`)).default;
    return deepMerge(enMessages, targetMessages);
  } catch {
    return enMessages;
  }
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
          messages: await loadLocaleMessages(pref.uiLocale),
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
    messages: await loadLocaleMessages(locale),
  };
});
