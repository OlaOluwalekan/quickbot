import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, ShareCreatedData } from "./types";

export function renderShareCreated(
  data: ShareCreatedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("shareCreated.subject", { title: data.title });
  const heading = t("shareCreated.heading");
  const greeting = t("shareCreated.greeting");
  const bodyText = t("shareCreated.body", { title: data.title });
  const actionLabel = t("shareCreated.button");
  const disclaimerText = t("shareCreated.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${escapeHtml(bodyText)}</p>`,
    bodyText,
    actionUrl: data.shareUrl,
    actionLabel,
    disclaimerHtml: escapeHtml(disclaimerText),
    disclaimerText,
    toEmail,
    supportEmail: site.emails.support,
    copyUrlNotice: t("layout.copyUrlNotice"),
    supportNotice: t("layout.supportNotice", {
      supportEmail: site.emails.support,
    }),
    legalNotice: t("layout.legalNotice", {
      companyLegalName: site.company.legalName,
      companyAddress: site.company.address,
      year: new Date().getFullYear().toString(),
    }),
    merchantOfRecordNotice: site.billingEnabled
      ? t("layout.merchantOfRecordNotice")
      : undefined,
    transactionalDisclaimer: t("layout.transactionalDisclaimer", {
      email: toEmail,
    }),
  });

  return {
    subject,
    html: rendered.html,
    text: rendered.text,
  };
}
