import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { escapeHtml } from "./escape";
import { EmailTemplateResult, EmailTranslator, NewSignInData } from "./types";

/** The device in the reader's language ("Chrome sur macOS"). */
function describeDevice(data: NewSignInData, t: EmailTranslator): string {
  if (data.customDevice) return data.customDevice;
  if (data.browser || data.os) {
    return t("newSignIn.deviceOn", {
      browser: data.browser || t("newSignIn.unknownBrowser"),
      os: data.os || t("newSignIn.unknownOs"),
    });
  }
  return data.device || t("newSignIn.unknownDevice");
}

function formatTime(data: NewSignInData, locale: string): string {
  const date = data.timeIso ? new Date(data.timeIso) : null;
  if (!date || Number.isNaN(date.getTime())) return data.time;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function renderNewSignIn(
  data: NewSignInData,
  t: EmailTranslator,
  toEmail: string,
  locale = "en"
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("newSignIn.subject");
  const heading = t("newSignIn.heading");
  const greeting = t("newSignIn.greeting");
  const bodyText = t("newSignIn.body", {
    time: formatTime(data, locale),
    device: describeDevice(data, t),
    ipAddress: data.ipAddress || t("newSignIn.unknownIp"),
    location: data.location || t("newSignIn.unknownLocation"),
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
