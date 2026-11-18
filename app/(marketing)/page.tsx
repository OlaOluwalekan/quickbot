import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import {
  MarketingHero,
  MarketingFeatureList,
  MarketingPricingTable,
  MarketingFAQ,
  MarketingCTA,
} from "@/components/marketing";

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations("Metadata.root");
  const t = await getTranslations("Landing");
  return publicPageMetadata({
    path: "/",
    title: tMeta("title"),
    absoluteTitle: true,
    description: t("heroDescription"),
  });
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
