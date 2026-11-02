import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, ResetPasswordData } from "./types";

export function renderResetPassword(
  data: ResetPasswordData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
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
