import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, SupportAckData } from "./types";

export function renderSupportAck(
  data: SupportAckData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const shortId = data.ticketId.slice(0, 8);
  const subject = t("supportAck.subject", { ticketId: shortId });
  const heading = t("supportAck.heading");
  const greeting = data.name
    ? t("supportAck.greetingWithName", { name: data.name })
    : t("supportAck.greeting");
  const bodyText = t("supportAck.body", {
    ticketId: shortId,
    topic: data.topic,
  });
  const quoteNotice = t("supportAck.quoteNotice");
  const responseTimeNotice = t("supportAck.responseTimeNotice");

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">${escapeHtml(bodyText)}</p>
    <div style="background-color: #f4f4f5; border-left: 3px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px; color: #3f3f46;">
      <p style="margin: 0 0 6px 0; font-weight: 600;">${escapeHtml(quoteNotice)}</p>
      <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(data.message)}</p>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #71717a;">${escapeHtml(responseTimeNotice)}</p>
  `;

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml,
    bodyText: `${bodyText}\n\n${quoteNotice}:\n${data.message}\n\n${responseTimeNotice}`,
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
