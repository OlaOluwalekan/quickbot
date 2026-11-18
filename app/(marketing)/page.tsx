import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  MarketingHero,
  MarketingFeatureList,
  MarketingPricingTable,
  MarketingFAQ,
  MarketingCTA,
} from "@/components/marketing";
import { buildAlternates } from "@/lib/seo/alternates";

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations("Metadata.landing");
  const t = await getTranslations("Landing");
  const title = tMeta("title");
  return {
    title,
    description: t("heroDescription"),
    alternates: buildAlternates("/"),
    openGraph: {
      title: `${title} · Klecx`,
      description: t("heroDescription"),
      url: "/",
    },
  };
}

export default function MarketingLandingPage() {
  return (
    <div className="flex flex-col w-full">
      <MarketingHero />
      <MarketingFeatureList />
      <MarketingPricingTable isTeaser />
      <MarketingFAQ />
      <MarketingCTA />
    </div>
  );
}
