import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, PasswordChangedData } from "./types";

export function renderPasswordChanged(
  data: PasswordChangedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("passwordChanged.subject");
  const heading = t("passwordChanged.heading");
  const greeting = t("passwordChanged.greeting");
  const bodyText = t("passwordChanged.body", { time: data.time });
  const actionLabel = t("passwordChanged.button");
  const disclaimerText = t("passwordChanged.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${escapeHtml(bodyText)}</p>`,
    bodyText,
    actionUrl: `${site.appUrl}/settings`,
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
