import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AboutView } from "@/components/marketing/about-view";
import { buildAlternates } from "@/lib/seo/alternates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.aboutPage");
  const title = `${t("heading")} · Klecx`;
  return {
    title,
    description: t("subheading"),
    alternates: buildAlternates("/about"),
    openGraph: {
      title,
      description: t("subheading"),
      url: "/about",
    },
  };
}

export default function AboutPage() {
  return <AboutView />;
}
