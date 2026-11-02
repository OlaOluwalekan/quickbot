import "server-only";
import { renderEmailLayout } from "./layout";
import { CreditsLowData, EmailTemplateResult, EmailTranslator } from "./types";

export function renderCreditsLow(
  data: CreditsLowData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const subject = t("creditsLow.subject");
  const heading = t("creditsLow.heading");
  const greeting = t("creditsLow.greeting");
  const bodyText = t("creditsLow.body", {
    remainingCredits: data.remainingCredits,
  });
  const actionLabel = t("creditsLow.button");
  const disclaimerText = t("creditsLow.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: data.upgradeUrl,
    actionLabel,
    disclaimerHtml: disclaimerText,
    disclaimerText,
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
