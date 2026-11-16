import "server-only";
import { db } from "@/server/db/client";
import { sendEmail } from "@/server/email/send";

export interface SendWelcomeEmailResult {
  sent: boolean;
  email?: string;
}

/**
 * Sends a welcome email to a new user exactly once.
 * Atomically updates `welcome_email_sent_at = now()` only if it was null and emailVerified is true.
 * Returns { sent: true } only when a row was claimed and the email was triggered.
 */
export async function sendWelcomeEmailOnce(
  userId: string,
  localeHint?: string
): Promise<SendWelcomeEmailResult> {
  try {
    // Atomic update claiming the welcome email slot.
    // Only succeeds if welcome_email_sent_at is NULL and emailVerified is true.
    const rows = await db.$queryRaw<Array<{ email: string; name: string | null }>>`
      UPDATE "users"
      SET "welcome_email_sent_at" = now()
      WHERE "id" = ${userId}
        AND "welcome_email_sent_at" IS NULL
        AND "emailVerified" = true
      RETURNING "email", "name"
    `;

    const row = rows[0];
    if (!row) {
      return { sent: false };
    }

    const { email, name } = row;

    // Fetch user's preferred locale if available
    let userLocale = localeHint;
    if (!userLocale) {
      const pref = await db.userPreference.findUnique({
        where: { userId },
        select: { uiLocale: true },
      });
      userLocale = pref?.uiLocale || undefined;
    }

    // Fire-and-forget email delivery with error logging
    void sendEmail(
      "welcome",
      email,
      { name: name || undefined },
      { locale: userLocale }
    ).catch((err: unknown) => {
      console.error("[Welcome] Failed to send welcome email:", err);
    });

    // In-app welcome notification
    await db.notification
      .create({
        data: {
          userId,
          type: "WELCOME",
          payload: {
            title: "Welcome to Klecx",
            message: "Get started by creating your first workspace or project.",
          },
          dedupeKey: `welcome:${userId}`,
          status: "UNREAD",
          emailStatus: "SENT",
        },
      })
      .catch(() => {});

    return { sent: true, email };
  } catch (err: unknown) {
    console.error(`[Welcome] Error processing welcome email for user ${userId}:`, err);
    return { sent: false };
  }
}
