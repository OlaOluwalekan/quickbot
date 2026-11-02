import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, PasswordChangedData } from "./types";

export function renderPasswordChanged(
  data: PasswordChangedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
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
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: "https://klecx.vyraxity.com/settings",
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
