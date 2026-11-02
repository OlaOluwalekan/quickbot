import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalNav } from "@/components/marketing/legal-nav";
import { CheckCircle2, AlertOctagon, ShieldAlert, Mail, Lock } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: `${t("acceptableUse.title")} · Klecx`,
    description: t("acceptableUse.subtitle"),
    alternates: {
      canonical: "/acceptable-use",
    },
    openGraph: {
      title: `${t("acceptableUse.title")} · Klecx`,
      description: t("acceptableUse.subtitle"),
      url: "/acceptable-use",
    },
  };
}

export default async function AcceptableUsePage() {
  const t = await getTranslations("Legal");

  // Get raw items array
  const rawItems = t.raw("acceptableUse.prohibitedItems") as string[];

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <LegalNav />

        {/* Header */}
        <div className="space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>{t("acceptableUse.title")}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("acceptableUse.title")}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t("acceptableUse.subtitle")}
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
          {/* Section 1 - Prohibited Items */}
          <section className="space-y-4 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <ShieldAlert className="h-4 w-4 text-danger" />
              <h2>{t("acceptableUse.prohibitedHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("acceptableUse.prohibitedIntro")}</p>
            <ul className="grid grid-cols-1 gap-2.5 pt-2">
              {Array.isArray(rawItems) &&
                rawItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-surface-2/40 px-3.5 py-2.5 text-xs text-fg"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger font-mono text-[10px] font-bold">
                      ✕
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
            </ul>
          </section>

          {/* Section 2 - Enforcement */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <AlertOctagon className="h-4 w-4 text-warning" />
              <h2>{t("acceptableUse.enforcementHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("acceptableUse.enforcementBody")}</p>
          </section>

          {/* Section 3 - Reporting Abuse */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Mail className="h-4 w-4 text-accent" />
              <h2>{t("acceptableUse.reportingHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("acceptableUse.reportingBody")}</p>
            <div className="pt-2">
              <a
                href="mailto:abuse@mail.klecx.vyraxity.com"
                className="inline-flex items-center gap-2 rounded-lg bg-surface-2 border border-border px-3.5 py-2 font-mono text-xs text-accent hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>abuse@mail.klecx.vyraxity.com</span>
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
