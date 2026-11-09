import "server-only";
import { renderSimpleEmail, appUrl } from "./simple";
import type {
  EmailTemplateResult,
  EmailTranslator,
  MemberLimitExceededData,
  MemberSuspendedData,
  MemberRestoredData,
} from "./types";

export function renderMemberLimitExceeded(
  data: MemberLimitExceededData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  return renderSimpleEmail({
    t,
    toEmail,
    subject: t("memberLimitExceeded.subject"),
    heading: t("memberLimitExceeded.heading"),
    greeting: t("memberLimitExceeded.greeting"),
    body: t("memberLimitExceeded.body", {
      limit: data.limit,
      graceEndsAt: data.graceEndsAt.slice(0, 10),
    }),
    actionUrl: data.manageUrl,
    actionLabel: t("memberLimitExceeded.button"),
    disclaimer: t("memberLimitExceeded.disclaimer"),
  });
}

export function renderMemberSuspended(
  data: MemberSuspendedData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const values = { resourceName: data.resourceName };
  return renderSimpleEmail({
    t,
    toEmail,
    subject: t("memberSuspended.subject", values),
    heading: t("memberSuspended.heading"),
    greeting: t("memberSuspended.greeting"),
    body: t("memberSuspended.body", values),
    actionUrl: data.actionUrl ?? appUrl("/workspaces"),
    actionLabel: t("memberSuspended.button"),
    disclaimer: t("memberSuspended.disclaimer"),
  });
}

export function renderMemberRestored(
  data: MemberRestoredData,
  t: EmailTranslator,
  toEmail: string
): EmailTemplateResult {
  const values = { resourceName: data.resourceName };
  return renderSimpleEmail({
    t,
    toEmail,
    subject: t("memberRestored.subject", values),
    heading: t("memberRestored.heading"),
    greeting: t("memberRestored.greeting"),
    body: t("memberRestored.body", values),
    actionUrl: data.actionUrl ?? appUrl("/workspaces"),
    actionLabel: t("memberRestored.button"),
    disclaimer: t("memberRestored.disclaimer"),
  });
}
