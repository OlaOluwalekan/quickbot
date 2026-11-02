import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, PaymentFailedData } from "./types";

export function renderPaymentFailed(
  data: PaymentFailedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const subject = t("paymentFailed.subject");
  const heading = t("paymentFailed.heading");
  const greeting = t("paymentFailed.greeting");
  const bodyText = data.reason
    ? t("paymentFailed.bodyWithReason", { reason: data.reason })
    : t("paymentFailed.body");
  const actionLabel = t("paymentFailed.button");
  const disclaimerText = t("paymentFailed.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: data.retryUrl,
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
