import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, SupportAckData } from "./types";

export function renderSupportAck(
  data: SupportAckData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
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
    <p style="margin: 0 0 16px 0;">${bodyText}</p>
    <div style="background-color: #f4f4f5; border-left: 3px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px; color: #3f3f46;">
      <p style="margin: 0 0 6px 0; font-weight: 600;">${quoteNotice}</p>
      <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(data.message)}</p>
    </div>
    <p style="margin: 16px 0 0 0; font-size: 13px; color: #71717a;">${responseTimeNotice}</p>
  `;

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml,
    bodyText: `${bodyText}\n\n${quoteNotice}:\n${data.message}\n\n${responseTimeNotice}`,
    toEmail,
    copyUrlNotice: t("common.copyUrlNotice"),
    supportNotice: t("common.supportNotice", {
      supportEmail: "support@mail.klecx.vyraxity.com",
    }),
    legalNotice: t("common.legalNotice", {
      year: new Date().getFullYear().toString(),
    }),
    transactionalDisclaimer: t("common.transactionalDisclaimer", {
      email: toEmail,
    }),
  });

  return {
    subject,
    html: rendered.html,
    text: rendered.text,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
