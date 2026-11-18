import * as React from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { PricingView } from "@/components/marketing/pricing-view";
import { PricingFaqJsonLd } from "@/components/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.pricingPage");
  return publicPageMetadata({
    path: "/pricing",
    title: t("heading"),
    description: t("subheading"),
  });
}

export default async function PricingPage() {
  const locale = await getLocale();
  return (
    <>
      <PricingFaqJsonLd locale={locale} />
      <PricingView />
    </>
  );
}
