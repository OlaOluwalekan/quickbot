import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PricingView } from "@/components/marketing/pricing-view";
import { PricingFaqJsonLd } from "@/components/seo/json-ld";
import { buildAlternates } from "@/lib/seo/alternates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.pricingPage");
  const title = `${t("heading")} · Klecx`;
  return {
    title,
    description: t("subheading"),
    alternates: buildAlternates("/pricing"),
    openGraph: {
      title,
      description: t("subheading"),
      url: "/pricing",
    },
  };
}

export default function PricingPage() {
  return (
    <>
      <PricingFaqJsonLd />
      <PricingView />
    </>
  );
}
