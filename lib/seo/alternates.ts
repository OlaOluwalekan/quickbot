import { getSiteConfig } from "@/server/config/site";
import { LOCALES } from "@/i18n/locales";

export function buildAlternates(pathname: string) {
  const siteUrl = getSiteConfig().appUrl.replace(/\/$/, "");
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const normalizedPath = cleanPath === "/" ? "" : cleanPath;
  const canonicalUrl = `${siteUrl}${normalizedPath}`;

  const perLocaleUrlsEnabled = process.env.MARKETING_LOCALE_URLS === "true";

  if (!perLocaleUrlsEnabled) {
    return {
      canonical: normalizedPath || "/",
    };
  }

  const languages: Record<string, string> = {};
  for (const loc of LOCALES) {
    languages[loc.hreflang] = `${siteUrl}/${loc.code}${normalizedPath}`;
  }
  languages["x-default"] = `${siteUrl}${normalizedPath || "/"}`;

  return {
    canonical: canonicalUrl,
    languages,
  };
}
