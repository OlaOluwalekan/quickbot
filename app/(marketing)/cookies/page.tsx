import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalNav } from "@/components/marketing/legal-nav";
import { Cookie, ShieldCheck, Database, Lock } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal");
  return {
    title: `${t("cookies.title")} · Klecx`,
    description: t("cookies.subtitle"),
    alternates: {
      canonical: "/cookies",
    },
    openGraph: {
      title: `${t("cookies.title")} · Klecx`,
      description: t("cookies.subtitle"),
      url: "/cookies",
    },
  };
}

export default async function CookiesPage() {
  const t = await getTranslations("Legal");

  const cookiesList = [
    {
      name: "better-auth.session_token",
      purpose: t("cookies.cookieAuth"),
      duration: t("cookies.durationSession"),
      type: "Essential / Security",
    },
    {
      name: "NEXT_LOCALE",
      purpose: t("cookies.cookieLocale"),
      duration: t("cookies.durationYear"),
      type: "Preference",
    },
    {
      name: "theme",
      purpose: t("cookies.cookieTheme"),
      duration: t("cookies.durationYear"),
      type: "Preference",
    },
    {
      name: "sidebar:state",
      purpose: t("cookies.cookieSidebar"),
      duration: t("cookies.durationYear"),
      type: "Preference",
    },
  ];

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <LegalNav />

        {/* Header */}
        <div className="space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Cookie className="h-3.5 w-3.5" />
            <span>{t("cookies.title")}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("cookies.title")}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t("cookies.subtitle")}
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
          {/* Section 1 - Overview */}
          <section className="space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <h2>{t("cookies.overviewHeading")}</h2>
            </div>
            <p className="text-fg-muted">{t("cookies.overviewBody")}</p>
          </section>

          {/* Section 2 - Cookies Table */}
          <section className="space-y-4 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 text-base font-bold text-fg">
              <Database className="h-4 w-4 text-accent" />
              <h2>{t("cookies.cookieTableHeading")}</h2>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-fg font-semibold border-b border-border">
                  <tr>
                    <th className="p-3.5">{t("cookies.cookieNameHeader")}</th>
                    <th className="p-3.5">{t("cookies.cookiePurposeHeader")}</th>
                    <th className="p-3.5">{t("cookies.cookieDurationHeader")}</th>
                    <th className="p-3.5">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-fg-muted">
                  {cookiesList.map((c) => (
                    <tr key={c.name} className="hover:bg-surface-2/50 transition-colors">
                      <td className="p-3.5 font-mono text-fg font-medium">{c.name}</td>
                      <td className="p-3.5 leading-relaxed">{c.purpose}</td>
                      <td className="p-3.5 whitespace-nowrap">{c.duration}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                          {c.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
