import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { FeaturesView } from "@/components/marketing/features-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.featuresPage");
  return publicPageMetadata({
    path: "/features",
    title: t("heading"),
    description: t("subheading"),
  });
}

export default function FeaturesPage() {
  return <FeaturesView />;
}
