import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FeaturesView } from "@/components/marketing/features-view";
import { buildAlternates } from "@/lib/seo/alternates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.featuresPage");
  const title = `${t("heading")} · Klecx`;
  return {
    title,
    description: t("subheading"),
    alternates: buildAlternates("/features"),
    openGraph: {
      title,
      description: t("subheading"),
      url: "/features",
    },
  };
}

export default function FeaturesPage() {
  return <FeaturesView />;
}
