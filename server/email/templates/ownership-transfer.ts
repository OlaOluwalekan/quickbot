import "server-only";
import { getSiteConfig } from "@/server/config/site";
import { renderEmailLayout } from "./layout";
import {
  EmailTemplateResult,
  EmailTranslator,
  OwnershipTransferRequestedData,
  OwnershipTransferAcceptedData,
} from "./types";

export function renderOwnershipTransferRequested(
  data: OwnershipTransferRequestedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("ownershipTransferRequested.subject", {
    fromUserName: data.fromUserName,
    resourceName: data.resourceName,
  });
  const heading = t("ownershipTransferRequested.heading");
  const greeting = t("ownershipTransferRequested.greeting");
  const bodyText = t("ownershipTransferRequested.body", {
    fromUserName: data.fromUserName,
    resourceName: data.resourceName,
  });
  const actionLabel = t("ownershipTransferRequested.button");
  const disclaimerText = t("ownershipTransferRequested.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: data.acceptUrl,
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

export function renderOwnershipTransferAccepted(
  data: OwnershipTransferAcceptedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const site = getSiteConfig();
  const subject = t("ownershipTransferAccepted.subject", {
    resourceName: data.resourceName,
    toUserName: data.toUserName,
  });
  const heading = t("ownershipTransferAccepted.heading");
  const greeting = t("ownershipTransferAccepted.greeting");
  const bodyText = t("ownershipTransferAccepted.body", {
    resourceName: data.resourceName,
    toUserName: data.toUserName,
  });
  const actionLabel = t("ownershipTransferAccepted.button");
  const disclaimerText = t("ownershipTransferAccepted.disclaimer");

  const rendered = renderEmailLayout({
    title: subject,
    heading,
    greeting,
    bodyHtml: `<p style="margin: 0;">${bodyText}</p>`,
    bodyText,
    actionUrl: `${site.appUrl}/workspaces`,
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
