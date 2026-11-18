import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BRAND } from "@/lib/brand/mark";

/**
 * The one web app manifest (served at /manifest.webmanifest), in the
 * request's locale. Icons are the generated ones from `app/icon.tsx` and
 * `app/apple-icon.tsx`, drawn from the shared mark (F5.10).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale();
  const t = await getTranslations("Metadata.manifest");

  return {
    name: t("name"),
    short_name: t("shortName"),
    description: t("description"),
    start_url: "/",
    display: "standalone",
    background_color: BRAND.tileDark,
    theme_color: BRAND.accentDark,
    lang: locale,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
