import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { CheckCircle2 } from "lucide-react";
import { LegalDocument, legalValues } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return publicPageMetadata({
    path: "/acceptable-use",
    title: t("acceptableUse.title"),
    description: t("acceptableUse.subtitle", legalValues()),
  });
}

export default function AcceptableUsePage() {
  return <LegalDocument doc="acceptableUse" icon={CheckCircle2} />;
}
