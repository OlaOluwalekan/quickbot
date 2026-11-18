import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { FileText } from "lucide-react";
import { LegalDocument, legalValues } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return publicPageMetadata({
    path: "/terms",
    title: t("terms.title"),
    description: t("terms.subtitle", legalValues()),
  });
}

export default function TermsPage() {
  return <LegalDocument doc="terms" icon={FileText} />;
}
