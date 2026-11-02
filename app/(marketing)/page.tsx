import * as React from "react";
import {
  MarketingHero,
  MarketingFeatureList,
  MarketingPricingTable,
  MarketingFAQ,
  MarketingCTA,
} from "@/components/marketing";

export const metadata = {
  title: "Klecx — Think in workspaces, not threads",
  description:
    "Organize AI work into projects, keep every answer's versions, and ask questions about any passage without losing your train of thought.",
};

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
