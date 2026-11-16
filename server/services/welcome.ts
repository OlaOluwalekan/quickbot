import "server-only";
import { db } from "@/server/db/client";
import { sendEmail } from "@/server/email/send";
import { detectUiLocale, isUiLocale, type UiLocale } from "@/lib/locale";

export interface SendWelcomeEmailResult {
  sent: boolean;
}

/**
 * Sends the welcome email to a user exactly once.
 *
 * The slot is claimed with one atomic UPDATE (`welcome_email_sent_at` NULL →
 * now(), only for a verified email), so concurrent hooks and repeated
 * verifications send at most one email. The email goes out only when this call
 * claimed the row. Never throws: a failure is logged and sign-up / verification
 * carry on.
 *
 * Locale: the person's `uiLocale` preference, else `requestLocale` (the locale
 * of the request that signed them up or verified the email), else `en`.
 */
export async function sendWelcomeEmailOnce(
  userId: string,
  requestLocale?: UiLocale
): Promise<SendWelcomeEmailResult> {
  try {
    const rows = await db.$queryRaw<Array<{ email: string; name: string | null }>>`
      UPDATE "users"
      SET "welcome_email_sent_at" = now()
      WHERE "id" = ${userId}
        AND "welcome_email_sent_at" IS NULL
        AND "emailVerified" = true
      RETURNING "email", "name"
    `;

    const row = rows[0];
    if (!row) return { sent: false };

    const pref = await db.userPreference.findUnique({
      where: { userId },
      select: { uiLocale: true },
    });
    const preferred = pref?.uiLocale;
    const locale = isUiLocale(preferred) ? preferred : requestLocale;

    // sendEmail logs delivery failures itself (masked address, no content).
    const result = await sendEmail(
      "welcome",
      row.email,
      { name: row.name?.trim() || undefined },
      { locale }
    );
    return { sent: result.success };
  } catch (err: unknown) {
    console.error(
      `[Welcome] Failed to send the welcome email for user ${userId}:`,
      err instanceof Error ? err.message : "unknown error"
    );
    return { sent: false };
  }
}

type HookUser = { id: string; emailVerified?: boolean | null };
type HookContext = { headers?: Headers; request?: Request } | null | undefined;

function localeFromContext(ctx: HookContext): UiLocale | undefined {
  const headers = ctx?.headers ?? ctx?.request?.headers;
  return headers ? detectUiLocale(headers) : undefined;
}

/**
 * `databaseHooks.user.create.after`: an OAuth sign-up with a verified email
 * gets the welcome email right away. A password sign-up is unverified here and
 * gets it from `welcomeOnUserUpdated` once the email is verified.
 */
export async function welcomeOnUserCreated(user: HookUser, ctx?: HookContext) {
  if (user.emailVerified !== true) return;
  await sendWelcomeEmailOnce(user.id, localeFromContext(ctx));
}

/**
 * `databaseHooks.user.update.after`: covers every way an email becomes
 * verified (the verification link, email change, linking a provider that
 * verifies it). The claim in `sendWelcomeEmailOnce` keeps it to one email.
 */
export async function welcomeOnUserUpdated(
  user: HookUser & { welcomeEmailSentAt?: Date | null },
  ctx?: HookContext
) {
  if (user.emailVerified !== true || user.welcomeEmailSentAt) return;
  await sendWelcomeEmailOnce(user.id, localeFromContext(ctx));
}
