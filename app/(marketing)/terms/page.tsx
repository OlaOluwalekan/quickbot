import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalNav } from "@/components/marketing/legal-nav";
import { FileText, UserCheck, CreditCard, Share2, Award, AlertCircle, Scale, Lock } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: `${t("terms.title")} · Klecx`,
    description: t("terms.subtitle"),
    alternates: {
      canonical: "/terms",
    },
    openGraph: {
      title: `${t("terms.title")} · Klecx`,
      description: t("terms.subtitle"),
      url: "/terms",
    },
  };
}

export default async function TermsPage() {
  const t = await getTranslations("Legal");

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <LegalNav />

        {/* Header */}
        <div className="space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <FileText className="h-3.5 w-3.5" />
            <span>{t("terms.title")}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("terms.title")}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t("terms.subtitle")}
          </p>
          <div className="text-xs text-fg-subtle pt-1 font-mono">
            {t("lastUpdated")}
          </div>
        </div>

        {/* English legal precision notice */}
        <div className="mb-8 rounded-xl border border-border/80 bg-surface-2/60 p-4 text-xs text-fg-muted flex items-start gap-3">
          <Lock className="h-4 w-4 text-accent mt-0.5 shrink-0" />
          <p>{t("englishNotice")}</p>
        </div>

        {/* Content Sections */}
        <div className="space-y-10 text-sm leading-relaxed text-fg">
          {/* Section 1 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <UserCheck className="h-4 w-4 text-accent" />
              <h2>{t("terms.accountHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("terms.accountBody")}</p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <CreditCard className="h-4 w-4 text-accent" />
              <h2>{t("terms.creditsHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("terms.creditsBody")}</p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Share2 className="h-4 w-4 text-accent" />
              <h2>{t("terms.sharingHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("terms.sharingBody")}</p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Award className="h-4 w-4 text-accent" />
              <h2>{t("terms.ownershipHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("terms.ownershipBody")}</p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <AlertCircle className="h-4 w-4 text-warning" />
              <h2>{t("terms.disclaimerHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("terms.disclaimerBody")}</p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Scale className="h-4 w-4 text-accent" />
              <h2>{t("terms.terminationHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("terms.terminationBody")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
