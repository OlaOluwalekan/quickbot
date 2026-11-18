import "server-only";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getSiteConfig } from "@/server/config/site";
import { getAlternateOgLocales, getLocaleDefinition } from "@/i18n/locales";
import { buildAlternates } from "./alternates";

/**
 * Metadata for a public (marketing, help, legal) page in the request locale.
 * `title` is the bare page title: the root layout's template adds the app
 * name. Page-level `openGraph` replaces the root one, so the locale,
 * alternate locales and site name are repeated here. `absoluteTitle` skips
 * the template (the landing page's title already names the app).
 * The share image is listed too: a page's own `openGraph`/`twitter` drops the
 * one the file convention (app/opengraph-image.tsx) would add.
 */
export async function publicPageMetadata({
  path,
  title,
  description,
  absoluteTitle = false,
}: {
  path: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
}): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Metadata");
  const site = getSiteConfig();
  const image = {
    url: "/opengraph-image/default",
    width: 1200,
    height: 630,
    alt: t("ogImageAlt", { appName: site.appName }),
  };
  // Headings used as titles may end with a period ("Simple, honest pricing.").
  title = title.replace(/\.$/, "");
  const fullTitle = absoluteTitle ? title : `${title} · ${site.appName}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: buildAlternates(path),
    openGraph: {
      type: "website",
      locale: getLocaleDefinition(locale).ogLocale,
      alternateLocale: getAlternateOgLocales(locale),
      siteName: site.appName,
      title: fullTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [{ ...image, url: "/twitter-image/default" }],
    },
  };
}
