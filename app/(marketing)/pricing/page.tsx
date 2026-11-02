import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PricingView } from "@/components/marketing/pricing-view";
import { PricingFaqJsonLd } from "@/components/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.pricingPage");
  return {
    title: "Pricing & Plans — Transparent AI Compute",
    description: t("subheading"),
    alternates: {
      canonical: "/pricing",
    },
    openGraph: {
      title: "Klecx Pricing & Plans — Transparent AI Compute",
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
