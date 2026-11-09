import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, ResetPasswordData } from "./types";

export function renderResetPassword(
  data: ResetPasswordData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("resetPassword.subject");
  const heading = t("resetPassword.heading");
  const greeting = data.name
    ? t("resetPassword.greetingWithName", { name: data.name })
    : t("resetPassword.greeting");
  const bodyText = t("resetPassword.body");
  const actionLabel = t("resetPassword.button");
  const disclaimerText = t("resetPassword.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${escapeHtml(bodyText)}</p>`,
    bodyText,
    actionUrl: data.url,
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
