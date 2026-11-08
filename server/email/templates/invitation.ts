import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import { EmailTemplateResult, EmailTranslator, InvitationData } from "./types";

export function renderInvitation(
  data: InvitationData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
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
