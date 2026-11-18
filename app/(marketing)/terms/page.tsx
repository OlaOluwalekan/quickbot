import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { LegalDocument, legalValues } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: `${t("terms.title")} · Klecx`,
    description: t("terms.subtitle", legalValues()),
    alternates: {
      canonical: "/terms",
    },
    openGraph: {
      title: `${t("terms.title")} · Klecx`,
      description: t("terms.subtitle", legalValues()),
      url: "/terms",
    },
  };
}

export default function TermsPage() {
  return <LegalDocument doc="terms" icon={FileText} />;
}
