import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, WelcomeEmailData } from "./types";

export function renderWelcome(
  data: WelcomeEmailData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("welcome.subject");
  const heading = t("welcome.heading");
  const greeting = data.name
    ? t("welcome.greetingWithName", { name: data.name })
    : t("welcome.greeting");
  const bodyText = t("welcome.body");
  const actionLabel = t("welcome.button");
  const actionUrl = `${site.appUrl}/workspaces`;
  const helpUrl = `${site.appUrl}/help`;
  const supportEmail = site.emails.support;

  const getStartedTitle = t("welcome.getStartedTitle");
  const step1Title = t("welcome.step1Title");
  const step1Desc = t("welcome.step1Desc");
  const step2Title = t("welcome.step2Title");
  const step2Desc = t("welcome.step2Desc");
  const step3Title = t("welcome.step3Title");
  const step3Desc = t("welcome.step3Desc");

  const helpNotice = t("welcome.helpNotice", {
    helpUrl,
    supportEmail,
  });
  const disclaimerText = t("welcome.disclaimer");

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">${escapeHtml(bodyText)}</p>
    <p style="margin: 0 0 12px 0; font-weight: 600;">${escapeHtml(getStartedTitle)}</p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 20px 0; width: 100%;">
      <tr>
        <td style="padding: 6px 0; vertical-align: top; width: 24px; font-weight: 700; color: #6366f1;">1.</td>
        <td style="padding: 6px 0; vertical-align: top;">
          <strong>${escapeHtml(step1Title)}</strong> — ${escapeHtml(step1Desc)}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; vertical-align: top; width: 24px; font-weight: 700; color: #6366f1;">2.</td>
        <td style="padding: 6px 0; vertical-align: top;">
          <strong>${escapeHtml(step2Title)}</strong> — ${escapeHtml(step2Desc)}
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; vertical-align: top; width: 24px; font-weight: 700; color: #6366f1;">3.</td>
        <td style="padding: 6px 0; vertical-align: top;">
          <strong>${escapeHtml(step3Title)}</strong> — ${escapeHtml(step3Desc)}
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
      ${escapeHtml(helpNotice)}
    </p>
  `;

  const bodyTextFull = [
    bodyText,
    "",
    getStartedTitle,
    `1. ${step1Title}: ${step1Desc}`,
    `2. ${step2Title}: ${step2Desc}`,
    `3. ${step3Title}: ${step3Desc}`,
    "",
    helpNotice,
  ].join("\n");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml,
    bodyText: bodyTextFull,
    actionUrl,
    actionLabel,
    disclaimerHtml: escapeHtml(disclaimerText),
    disclaimerText,
    toEmail,
    supportEmail,
    copyUrlNotice: t("layout.copyUrlNotice"),
    supportNotice: t("layout.supportNotice", {
      supportEmail,
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
