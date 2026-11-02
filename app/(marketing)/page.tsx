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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Landing");
  return {
    title: "Workspaces, not threads",
    description: t("heroDescription"),
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: "Workspaces, not threads · Klecx",
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
