import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, ShareCreatedData } from "./types";

export function renderShareCreated(
  data: ShareCreatedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const subject = t("shareCreated.subject", { title: data.title });
  const heading = t("shareCreated.heading");
  const greeting = t("shareCreated.greeting");
  const bodyText = t("shareCreated.body", { title: data.title });
  const actionLabel = t("shareCreated.button");
  const disclaimerText = t("shareCreated.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: data.shareUrl,
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
