import "server-only";
import { renderSimpleEmail, appUrl } from "./simple";
import type {
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
  const values = { fromUserName: data.fromUserName, resourceName: data.resourceName };
  return renderSimpleEmail({
    t,
    toEmail,
    subject: t("ownershipTransferRequested.subject", values),
    heading: t("ownershipTransferRequested.heading"),
    greeting: t("ownershipTransferRequested.greeting"),
    body: t("ownershipTransferRequested.body", values),
    actionUrl: data.acceptUrl,
    actionLabel: t("ownershipTransferRequested.button"),
    disclaimer: t("ownershipTransferRequested.disclaimer", { days: data.expiresInDays ?? 7 }),
  });
}

export function renderOwnershipTransferAccepted(
  data: OwnershipTransferAcceptedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const values = { toUserName: data.toUserName, resourceName: data.resourceName };
  const left = data.previousOwnerAction === "LEAVE";
  return renderSimpleEmail({
    t,
    toEmail,
    subject: t("ownershipTransferAccepted.subject", values),
    heading: t("ownershipTransferAccepted.heading"),
    greeting: t("ownershipTransferAccepted.greeting"),
    body: t(left ? "ownershipTransferAccepted.bodyLeft" : "ownershipTransferAccepted.body", values),
    actionUrl: data.actionUrl ?? appUrl("/workspaces"),
    actionLabel: t("ownershipTransferAccepted.button"),
    disclaimer: t("ownershipTransferAccepted.disclaimer"),
  });
}
