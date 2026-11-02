import * as React from "react";
import { PricingView } from "@/components/marketing/pricing-view";

export const metadata = {
  title: "Pricing & Plans — Klecx",
  description:
    "Transparent pricing matching real provider computation costs. Free, Lite, Standard, and Pro tiers with zero dark patterns.",
};

export default function PricingPage() {
  return <PricingView />;
}
