import "server-only";
import { Resend } from "resend";
import { env } from "@/server/env";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";
import {
  EmailTemplateMap,
  EmailTemplateName,
  EmailTemplateResult,
  EmailTranslator,
} from "./templates/types";
import { renderVerifyEmail } from "./templates/verify-email";
import { renderResetPassword } from "./templates/reset-password";
import { renderInvitation } from "./templates/invitation";
import { renderNewSignIn } from "./templates/new-sign-in";
import { renderPasswordChanged } from "./templates/password-changed";
import { renderShareCreated } from "./templates/share-created";
import { renderCreditsLow } from "./templates/credits-low";
import { renderPaymentFailed } from "./templates/payment-failed";

export type {
  EmailTemplateMap,
  EmailTemplateName,
  EmailTemplateResult,
} from "./templates/types";

const messagesMap = {
  en: enMessages,
  es: esMessages,
  fr: frMessages,
} as const;

export type SupportedLocale = keyof typeof messagesMap;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current &&
      typeof current === "object" &&
      part in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof current === "string" ? current : path;
}

function interpolateMessage(
  pattern: string,
  values?: Record<string, unknown>
): string {
  if (!values) return pattern;
  let result = pattern;
  for (const [key, val] of Object.entries(values)) {
    if (val !== undefined && val !== null) {
      result = result.split(`{${key}}`).join(String(val));
    }
  }
  return result;
}

/**
 * Resolves a translator function for the given locale.
 * Uses next-intl getTranslations when in server context, or localized message dictionaries.
 */
export async function getEmailTranslator(
  locale?: string
): Promise<{ t: EmailTranslator; locale: SupportedLocale }> {
  const normLocale = (
    locale && ["en", "es", "fr"].includes(locale.toLowerCase().slice(0, 2))
      ? locale.toLowerCase().slice(0, 2)
      : "en"
  ) as SupportedLocale;

  try {
    const { getTranslations } = await import("next-intl/server");
    const nextIntlT = await getTranslations({
      locale: normLocale,
      namespace: "Email",
    });
    return {
      t: (key: string, values?: Record<string, unknown>) =>
        nextIntlT(key as any, values as any),
      locale: normLocale,
    };
  } catch {
    const emailNamespace =
      ((messagesMap[normLocale] as Record<string, unknown>)
        ?.Email as Record<string, unknown>) || {};

    return {
      t: (key: string, values?: Record<string, unknown>) => {
        const pattern = getNestedValue(emailNamespace, key);
        if (pattern === key) return key;
        return interpolateMessage(pattern, values);
      },
      locale: normLocale,
    };
  }
}

/**
 * Pure template dispatcher rendering `{ subject, html, text }` for any template and locale.
 */
export async function renderEmail<T extends EmailTemplateName>(
  template: T,
  to: string,
  data: EmailTemplateMap[T],
  opts?: { locale?: string }
): Promise<EmailTemplateResult> {
  const { t } = await getEmailTranslator(opts?.locale);

  switch (template) {
    case "verify-email":
      return renderVerifyEmail(
        data as EmailTemplateMap["verify-email"],
        t,
        to
      );
    case "reset-password":
      return renderResetPassword(
        data as EmailTemplateMap["reset-password"],
        t,
        to
      );
    case "invitation":
      return renderInvitation(data as EmailTemplateMap["invitation"], t, to);
    case "new-sign-in":
      return renderNewSignIn(data as EmailTemplateMap["new-sign-in"], t, to);
    case "password-changed":
      return renderPasswordChanged(
        data as EmailTemplateMap["password-changed"],
        t,
        to
      );
    case "share-created":
      return renderShareCreated(
        data as EmailTemplateMap["share-created"],
        t,
        to
      );
    case "credits-low":
      return renderCreditsLow(data as EmailTemplateMap["credits-low"], t, to);
    case "payment-failed":
      return renderPaymentFailed(
        data as EmailTemplateMap["payment-failed"],
        t,
        to
      );
    default: {
      const exhaustiveCheck: never = template;
      throw new Error(`Unknown email template: ${exhaustiveCheck}`);
    }
  }
}

export function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "***";
  const [user, domain] = parts;
  const maskedUser =
    user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
  return `${maskedUser}@${domain}`;
}

export interface SendEmailOptions {
  locale?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export function getResendClient(): Resend {
  return new Resend(env.RESEND_API_KEY);
}

/**
 * Transactional email sender:
 * - One place that sends all emails with templates, localization, and no secrets in logs.
 * - In development with a placeholder/dummy key, writes the email (and its link) to the console.
 */
export async function sendEmail<T extends EmailTemplateName>(
  template: T,
  to: string,
  data: EmailTemplateMap[T],
  opts?: SendEmailOptions
): Promise<SendEmailResult> {
  const rendered = await renderEmail(template, to, data, opts);

  // In development with no live Resend key or a placeholder key, log the email and link for local clicking
  if (
    env.NODE_ENV === "development" &&
    (!env.RESEND_API_KEY ||
      env.RESEND_API_KEY.includes("dummy") ||
      env.RESEND_API_KEY.includes("placeholder") ||
      env.RESEND_API_KEY.startsWith("re_dev"))
  ) {
    const rawData = data as unknown as Record<string, unknown>;
    const actionUrl =
      (rawData.url as string) ||
      (rawData.inviteUrl as string) ||
      (rawData.shareUrl as string) ||
      (rawData.upgradeUrl as string) ||
      (rawData.retryUrl as string) ||
      null;

    console.info(
      `\n📧 [Email Dev Console]\n` +
        `Template: ${template} (locale: ${opts?.locale || "en"})\n` +
        `To: ${to}\n` +
        `Subject: ${rendered.subject}\n` +
        (actionUrl ? `Action Link: ${actionUrl}\n` : "") +
        `----------------------------------------\n`
    );
    return { success: true, id: `dev-${Date.now()}` };
  }

  try {
    const resend = getResendClient();
    const { data: resData, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [to],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (error) {
      console.error(
        `[Email] Delivery failure template=${template} to=${maskEmail(to)} error=${error.message}`
      );

      if (env.NODE_ENV === "development") {
        const rawData = data as unknown as Record<string, unknown>;
        const actionUrl =
          (rawData.url as string) ||
          (rawData.inviteUrl as string) ||
          (rawData.shareUrl as string) ||
          null;
        console.info(
          `[Dev Email Fallback:${template}] to=${to} url=${actionUrl}`
        );
      }

      return { success: false, error: error.message };
    }

    if (env.NODE_ENV === "production") {
      console.info(
        `[Email] Sent template=${template} to=${maskEmail(to)} id=${resData?.id}`
      );
    } else {
      console.info(
        `[Email] Sent template=${template} to=${to} id=${resData?.id}`
      );
    }

    return { success: true, id: resData?.id };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unexpected email error";
    console.error(
      `[Email] Unexpected error template=${template} to=${maskEmail(to)} error=${errorMessage}`
    );

    if (env.NODE_ENV === "development") {
      // In dev fallback, write the clickable link
      const rawData = data as unknown as Record<string, unknown>;
      const actionUrl =
        (rawData.url as string) ||
        (rawData.inviteUrl as string) ||
        (rawData.shareUrl as string) ||
        null;
      console.info(
        `[Dev Email Fallback:${template}] to=${to} url=${actionUrl}`
      );
    }

    return { success: false, error: errorMessage };
  }
}
