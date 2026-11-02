import "server-only";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, InvitationData } from "./types";

export function renderInvitation(
  data: InvitationData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const subject = t("invitation.subject", {
    inviterName: data.inviterName,
    teamOrProjectName: data.teamOrProjectName,
  });
  const heading = t("invitation.heading");
  const greeting = t("invitation.greeting");
  const bodyText = t("invitation.body", {
    inviterName: data.inviterName,
    teamOrProjectName: data.teamOrProjectName,
    role: data.role || "Member",
  });
  const actionLabel = t("invitation.button");
  const disclaimerText = t("invitation.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: data.inviteUrl,
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
