import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { LegalNav } from "@/components/marketing/legal-nav";
import { getSiteConfig } from "@/server/config/site";

export type LegalDocKey = "terms" | "privacy" | "acceptableUse" | "cookies";

/** One section of a legal document, as stored in `Legal.<doc>.sections` (F5.5). */
export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Paragraphs rendered after the section's extra content (e.g. a table). */
  afterTable?: string[];
  /** Shown only when billing is live (`billingOn`) or not (`billingOff`). */
  when?: "billingOn" | "billingOff";
}

/** Values the legal texts may use as {placeholders}, read from env (rule 5). */
export function legalValues() {
  const site = getSiteConfig();
  return {
    companyName: site.company.legalName,
    companyAddress: site.company.address,
    companyCountry: site.company.country,
    appUrl: site.appUrl,
    supportEmail: site.emails.support,
    privacyEmail: site.emails.privacy,
    abuseEmail: site.emails.abuse,
    legalEmail: site.emails.legal,
    billingEmail: site.emails.billing,
  };
}

/** The sections of a document that apply right now (billing on or off). */
export function visibleSections(sections: LegalSection[], billingEnabled: boolean) {
  return sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) =>
      section.when === "billingOn"
        ? billingEnabled
        : section.when === "billingOff"
          ? !billingEnabled
          : true
    );
}

/**
 * Renders a legal document entirely from messages, with a table of contents
 * and anchor links (#acceptance…). `extras` inserts content (e.g. a table)
 * into the section with that id, before its `afterTable` paragraphs.
 */
export async function LegalDocument({
  doc,
  icon: Icon,
  extras = {},
}: {
  doc: LegalDocKey;
  icon: LucideIcon;
  extras?: Record<string, React.ReactNode>;
}) {
  const t = await getTranslations("Legal");
  const format = await getFormatter();
  const values = legalValues();
  const sections = visibleSections(
    t.raw(`${doc}.sections`) as LegalSection[],
    getSiteConfig().billingEnabled
  );
  const updated = format.dateTime(new Date(`${t("updatedAt")}T00:00:00Z`), {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const text = (path: string) => t(`${doc}.sections.${path}`, values);

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <LegalNav />

        <header className="space-y-3 mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Icon className="h-3.5 w-3.5" />
            <span>{t(`${doc}.title`)}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t(`${doc}.title`)}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t(`${doc}.subtitle`, values)}
          </p>
          <p className="text-xs text-fg-subtle pt-1">{t("lastUpdated", { date: updated })}</p>
        </header>

        <nav
          aria-label={t("contents")}
          className="mb-10 rounded-2xl border border-border/60 bg-surface-2/40 p-5"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle mb-3">
            {t("contents")}
          </h2>
          <ol className="grid gap-1.5 sm:grid-cols-2 text-sm">
            {sections.map(({ section }) => (
              <li key={`${section.id}-${section.when ?? "all"}`}>
                <a href={`#${section.id}`} className="text-fg-muted hover:text-accent hover:underline">
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-8 text-sm leading-relaxed text-fg">
          {sections.map(({ section, index }) => (
            <section
              key={`${section.id}-${section.when ?? "all"}`}
              id={section.id}
              className="scroll-mt-24 space-y-3 rounded-2xl border border-border/60 bg-surface p-6 shadow-2xs"
            >
              <h2 className="text-base font-bold text-fg">
                <a href={`#${section.id}`} className="hover:text-accent">
                  {section.heading}
                </a>
              </h2>
              {section.paragraphs?.map((_, j) => (
                <p key={j} className="text-fg-muted">
                  {text(`${index}.paragraphs.${j}`)}
                </p>
              ))}
              {section.bullets && (
                <ul className="list-disc space-y-1.5 pl-5 text-fg-muted">
                  {section.bullets.map((_, j) => (
                    <li key={j}>{text(`${index}.bullets.${j}`)}</li>
                  ))}
                </ul>
              )}
              {extras[section.id]}
              {section.afterTable?.map((_, j) => (
                <p key={j} className="text-fg-muted">
                  {text(`${index}.afterTable.${j}`)}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-10 text-xs text-fg-subtle">{t("languageClause")}</p>
      </div>
    </div>
  );
}
