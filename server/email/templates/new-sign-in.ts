import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, NewSignInData } from "./types";

export function renderNewSignIn(
  data: NewSignInData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("newSignIn.subject");
  const heading = t("newSignIn.heading");
  const greeting = t("newSignIn.greeting");
  const bodyText = t("newSignIn.body", {
    time: data.time,
    device: data.device || "Unknown device",
    ipAddress: data.ipAddress || "Unknown IP",
    location: data.location || "Unknown location",
  });
  const actionLabel = t("newSignIn.button");
  const disclaimerText = t("newSignIn.disclaimer");

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
