import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { Shield } from "lucide-react";
import { LegalDocument, legalValues } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return publicPageMetadata({
    path: "/privacy",
    title: t("privacy.title"),
    description: t("privacy.subtitle", legalValues()),
  });
}

export default async function PrivacyPage() {
  const t = await getTranslations("Legal.privacy");
  const processors = t.raw("processors") as { name: string; purpose: string }[];
  return (
    <LegalDocument
      doc="privacy"
      icon={Shield}
      extras={{
        recipients: (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2/60 text-xs text-fg-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t("processorsHeading")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("processorsPurposeHeading")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {processors.map((p, i) => (
                  <tr key={p.name}>
                    <td className="px-4 py-2.5 font-medium text-fg whitespace-nowrap">{t(`processors.${i}.name`)}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{t(`processors.${i}.purpose`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      }}
    />
  );
}
