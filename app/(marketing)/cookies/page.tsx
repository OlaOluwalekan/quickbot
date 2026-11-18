import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { Cookie } from "lucide-react";
import { STORAGE_ITEMS } from "@/lib/legal/cookies";
import { LegalDocument, legalValues } from "@/components/legal/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return publicPageMetadata({
    path: "/cookies",
    title: t("cookies.title"),
    description: t("cookies.subtitle", legalValues()),
  });
}

export default async function CookiesPage() {
  const t = await getTranslations("Legal.cookies");
  return (
    <LegalDocument
      doc="cookies"
      icon={Cookie}
      extras={{
        list: (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2/60 text-xs text-fg-subtle">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t("table.name")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("table.type")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("table.purpose")}</th>
                  <th className="px-4 py-2.5 font-semibold">{t("table.duration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 align-top">
                {STORAGE_ITEMS.map((item) => (
                  <tr key={item.names[0]}>
                    <td className="px-4 py-2.5">
                      {item.names.map((name) => (
                        <code key={name} className="block font-mono text-xs text-fg break-all">
                          {name}
                        </code>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted whitespace-nowrap">
                      {t(`types.${item.kind}`)} · {t(`categories.${item.category}`)}
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{t(`purposes.${item.purpose}`)}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{t(`durations.${item.duration}`)}</td>
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
