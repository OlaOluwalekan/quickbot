import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, NewSignInData } from "./types";

export function renderNewSignIn(
  data: NewSignInData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
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
