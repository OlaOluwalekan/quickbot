import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, Locale, LOCALE_COOKIE, locales } from "./config";

function isValidLocale(val: string | undefined): val is Locale {
  return Boolean(val && locales.includes(val as Locale));
}

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale;

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

    if (isValidLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
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
