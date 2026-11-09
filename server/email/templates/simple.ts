import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import type { EmailTemplateResult, EmailTranslator } from "./types";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * One-paragraph transactional email. Translated strings may contain
 * user-controlled values (workspace titles, names), so the HTML parts are escaped.
 */
export function renderSimpleEmail(opts: {
  t: EmailTranslator;
  toEmail: string;
  subject: string;
  heading: string;
  greeting: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  disclaimer: string;
}): EmailTemplateResult {
  const { t, toEmail } = opts;
  const site = getSiteConfig();
  const rendered = renderEmailLayout({
    title: escapeHtml(opts.subject),
    heading: escapeHtml(opts.heading),
    greeting: escapeHtml(opts.greeting),
    bodyHtml: `<p style="margin: 0;">${escapeHtml(opts.body)}</p>`,
    bodyText: opts.body,
    actionUrl: opts.actionUrl,
    actionLabel: opts.actionLabel,
    disclaimerHtml: escapeHtml(opts.disclaimer),
    disclaimerText: opts.disclaimer,
    toEmail,
    supportEmail: site.emails.support,
    copyUrlNotice: t("layout.copyUrlNotice"),
    supportNotice: t("layout.supportNotice", { supportEmail: site.emails.support }),
    legalNotice: t("layout.legalNotice", {
      companyLegalName: site.company.legalName,
      companyAddress: site.company.address,
      year: new Date().getFullYear().toString(),
    }),
    merchantOfRecordNotice: site.billingEnabled ? t("layout.merchantOfRecordNotice") : undefined,
    transactionalDisclaimer: t("layout.transactionalDisclaimer", { email: toEmail }),
  });
  return { subject: opts.subject, html: rendered.html, text: rendered.text };
}

export function appUrl(path: string): string {
  return `${getSiteConfig().appUrl.replace(/\/$/, "")}${path}`;
}
