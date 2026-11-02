import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, SupportNotificationData } from "./types";

export function renderSupportNotification(
  data: SupportNotificationData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const shortId = data.ticketId.slice(0, 8);
  const subject = `[Support #${shortId}] ${data.topic} (${data.senderEmail})`;
  const heading = `Support Request #${shortId}`;
  const greeting = "Hello Support Team,";
  const bodyText = `A new support request has been submitted by ${data.senderEmail}.\n\nTopic: ${data.topic}\nTicket ID: ${data.ticketId}\nUser ID: ${data.userId ?? "Anonymous"}\n\nMessage:\n${data.message}`;

  const bodyHtml = `
    <p style="margin: 0 0 12px 0;">A new support request has been submitted.</p>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
      <tr><td style="padding: 4px 8px; font-weight: 600; width: 120px;">Ticket ID:</td><td style="padding: 4px 8px; font-family: monospace;">${data.ticketId}</td></tr>
      <tr><td style="padding: 4px 8px; font-weight: 600;">From:</td><td style="padding: 4px 8px;">${data.senderEmail}</td></tr>
      <tr><td style="padding: 4px 8px; font-weight: 600;">User ID:</td><td style="padding: 4px 8px; font-family: monospace;">${data.userId ?? "Anonymous"}</td></tr>
      <tr><td style="padding: 4px 8px; font-weight: 600;">Topic:</td><td style="padding: 4px 8px;">${escapeHtml(data.topic)}</td></tr>
    </table>
    <div style="background-color: #f4f4f5; border-left: 3px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px; color: #27272a;">
      <p style="margin: 0 0 4px 0; font-weight: 600;">Message Content:</p>
      <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(data.message)}</p>
    </div>
    ${
      data.diagnostics
        ? `
      <div style="background-color: #fafafa; border: 1px solid #e4e4e7; padding: 12px; margin-top: 16px; border-radius: 4px; font-size: 12px;">
        <p style="margin: 0 0 6px 0; font-weight: 600;">Diagnostics:</p>
        <pre style="margin: 0; font-family: monospace; white-space: pre-wrap; font-size: 11px;">${escapeHtml(data.diagnostics)}</pre>
      </div>`
        : ""
    }
  `;

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml,
    bodyText,
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
