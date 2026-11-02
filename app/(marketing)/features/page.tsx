import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FeaturesView } from "@/components/marketing/features-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.featuresPage");
  return {
    title: "Features & Architecture — Klecx",
    description: t("subheading"),
    alternates: {
      canonical: "/features",
    },
    openGraph: {
      title: "Features & Architecture — Klecx",
      description: t("subheading"),
      url: "/features",
    },
  };
}

export default function FeaturesPage() {
  return <FeaturesView />;
}
