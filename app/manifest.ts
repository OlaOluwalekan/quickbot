import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BRAND } from "@/lib/brand/mark";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";

const manifestMessages: Record<string, any> = {
  en: enMessages.Metadata.manifest,
  es: esMessages.Metadata.manifest,
  fr: frMessages.Metadata.manifest,
};

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let locale = "en";
  try {
    locale = (await getLocale()) || "en";
  } catch {
    locale = (typeof process !== "undefined" && process.env?.NEXT_LOCALE) || "en";
  }

  let t: any = null;
  try {
    t = await getTranslations("Metadata.manifest");
  } catch {
    // outside next-intl server context
  }

  const fallback = manifestMessages[locale] || manifestMessages.en;
  const name = t ? t("name") : fallback.name;
  const short_name = t ? t("shortName") : fallback.shortName;
  const description = t ? t("description") : fallback.description;

  return {
    name,
    short_name,
    description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.tileDark,
    theme_color: BRAND.accentDark,
    lang: locale,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
  };
}
