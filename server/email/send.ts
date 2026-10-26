import "server-only";
import { env } from "@/server/env";
import sendResendEmail from "@/utils/emails/send-email";

export type EmailTemplate = "verify-email" | "reset-password";

/**
 * Email sender used by Better Auth callbacks.
 * Full localized template engine is wired in Step 1.7.
 */
export async function sendEmail(
  template: EmailTemplate,
  to: string,
  data: { url: string },
  _opts?: { locale?: string }
): Promise<void> {
  if (env.NODE_ENV !== "production" && env.RESEND_API_KEY.startsWith("re_ci")) {
    console.info(`[Email stub:${template}] to=${to} url=${data.url}`);
    return;
  }

  const subject =
    template === "verify-email"
      ? "Verify your Klecx email address"
      : "Reset your Klecx password";

  const actionLabel =
    template === "verify-email" ? "Verify Email" : "Reset Password";

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-bottom: 12px;">${subject}</h2>
      <p style="color: #475569; line-height: 1.5;">
        Click the button below to ${actionLabel.toLowerCase()}:
      </p>
      <p style="margin: 24px 0;">
        <a href="${data.url}" style="background: #4f46e5; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          ${actionLabel}
        </a>
      </p>
      <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
        ${data.url}
      </p>
    </div>
  `;

  try {
    await sendResendEmail(to, subject, html);
  } catch (err) {
    if (env.NODE_ENV !== "production") {
      console.info(`[Dev Email Fallback:${template}] to=${to} url=${data.url}`, err);
    }
  }
}
