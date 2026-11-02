import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalNav } from "@/components/marketing/legal-nav";
import { Shield, Lock, Server, Clock, UserCheck, AlertTriangle, Mail } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: `${t("privacy.title")} · Klecx`,
    description: t("privacy.subtitle"),
    alternates: {
      canonical: "/privacy",
    },
    openGraph: {
      title: `${t("privacy.title")} · Klecx`,
      description: t("privacy.subtitle"),
      url: "/privacy",
    },
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("Legal");

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <LegalNav />

        {/* Header */}
        <div className="space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Shield className="h-3.5 w-3.5" />
            <span>{t("privacy.title")}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("privacy.title")}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t("privacy.subtitle")}
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
              <Server className="h-4 w-4 text-accent" />
              <h2>{t("privacy.storageHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("privacy.storageBody")}</p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Lock className="h-4 w-4 text-accent" />
              <h2>{t("privacy.processorsHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("privacy.processorsBody")}</p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Clock className="h-4 w-4 text-accent" />
              <h2>{t("privacy.retentionHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("privacy.retentionBody")}</p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <UserCheck className="h-4 w-4 text-accent" />
              <h2>{t("privacy.rightsHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("privacy.rightsBody")}</p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2>{t("privacy.childrenHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("privacy.childrenBody")}</p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Mail className="h-4 w-4 text-accent" />
              <h2>{t("privacy.contactHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("privacy.contactBody")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
