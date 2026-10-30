import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, VerifyEmailData } from "./types";

export function renderVerifyEmail(
  data: VerifyEmailData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const subject = t("verifyEmail.subject");
  const heading = t("verifyEmail.heading");
  const greeting = data.name
    ? t("verifyEmail.greetingWithName", { name: data.name })
    : t("verifyEmail.greeting");
  const bodyText = t("verifyEmail.body");
  const actionLabel = t("verifyEmail.button");
  const disclaimerText = t("verifyEmail.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: data.url,
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
