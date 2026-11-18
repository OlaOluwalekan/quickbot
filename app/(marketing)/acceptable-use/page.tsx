import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { LegalDocument, legalValues } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: `${t("acceptableUse.title")} · Klecx`,
    description: t("acceptableUse.subtitle", legalValues()),
    alternates: {
      canonical: "/acceptable-use",
    },
    openGraph: {
      title: `${t("acceptableUse.title")} · Klecx`,
      description: t("acceptableUse.subtitle", legalValues()),
      url: "/acceptable-use",
    },
  };
}

export default function AcceptableUsePage() {
  return <LegalDocument doc="acceptableUse" icon={CheckCircle2} />;
}
