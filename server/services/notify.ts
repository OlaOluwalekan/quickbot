import "server-only";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { Errors } from "@/server/http/errors";
import { toPage } from "@/server/http/pagination";
import { sendEmail, type EmailTemplateName, type EmailTemplateMap } from "@/server/email/send";
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/schemas/notification";
import type { Prisma, NotifStatus, EmailStatus } from "@/server/db/generated/client";

export { NOTIFICATION_TYPES, type NotificationType };

export interface NotificationChannelConfig {
  inApp: boolean;
  email: boolean;
}

export type NotificationPreferencesMap = Record<
  NotificationType,
  NotificationChannelConfig
>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferencesMap = {
  INVITE_RECEIVED:      { inApp: true, email: true },
  INVITE_ACCEPTED:      { inApp: true, email: false },
  MEMBER_REMOVED:       { inApp: true, email: false },
  ROLE_CHANGED:         { inApp: true, email: false },
  SHARE_CREATED:        { inApp: true, email: true },
  CREDITS_LOW:          { inApp: true, email: true },
  CREDITS_EXHAUSTED:    { inApp: true, email: true },
  PAYMENT_FAILED:       { inApp: true, email: true },
  SUBSCRIPTION_CHANGED: { inApp: true, email: true },
  NEW_SIGN_IN:          { inApp: true, email: true },
  EXPORT_READY:         { inApp: true, email: false },
  QUESTIONS_ANSWERED:   { inApp: true, email: false },
  OWNERSHIP_TRANSFER_REQUESTED: { inApp: true, email: true },
  OWNERSHIP_TRANSFER_ACCEPTED:  { inApp: true, email: true },
  OWNERSHIP_TRANSFER_DECLINED:  { inApp: true, email: false },
  MEMBER_LIMIT_EXCEEDED:        { inApp: true, email: true },
  MEMBER_SUSPENDED:             { inApp: true, email: true },
  MEMBER_RESTORED:              { inApp: true, email: true },
};

export function resolveNotificationPreferences(
  raw: unknown
): NotificationPreferencesMap {
  const result: NotificationPreferencesMap = {
    INVITE_RECEIVED:      { ...DEFAULT_NOTIFICATION_PREFS.INVITE_RECEIVED },
    INVITE_ACCEPTED:      { ...DEFAULT_NOTIFICATION_PREFS.INVITE_ACCEPTED },
    MEMBER_REMOVED:       { ...DEFAULT_NOTIFICATION_PREFS.MEMBER_REMOVED },
    ROLE_CHANGED:         { ...DEFAULT_NOTIFICATION_PREFS.ROLE_CHANGED },
    SHARE_CREATED:        { ...DEFAULT_NOTIFICATION_PREFS.SHARE_CREATED },
    CREDITS_LOW:          { ...DEFAULT_NOTIFICATION_PREFS.CREDITS_LOW },
    CREDITS_EXHAUSTED:    { ...DEFAULT_NOTIFICATION_PREFS.CREDITS_EXHAUSTED },
    PAYMENT_FAILED:       { ...DEFAULT_NOTIFICATION_PREFS.PAYMENT_FAILED },
    SUBSCRIPTION_CHANGED: { ...DEFAULT_NOTIFICATION_PREFS.SUBSCRIPTION_CHANGED },
    NEW_SIGN_IN:          { ...DEFAULT_NOTIFICATION_PREFS.NEW_SIGN_IN },
    EXPORT_READY:         { ...DEFAULT_NOTIFICATION_PREFS.EXPORT_READY },
    QUESTIONS_ANSWERED:   { ...DEFAULT_NOTIFICATION_PREFS.QUESTIONS_ANSWERED },
    OWNERSHIP_TRANSFER_REQUESTED: { ...DEFAULT_NOTIFICATION_PREFS.OWNERSHIP_TRANSFER_REQUESTED },
    OWNERSHIP_TRANSFER_ACCEPTED:  { ...DEFAULT_NOTIFICATION_PREFS.OWNERSHIP_TRANSFER_ACCEPTED },
    OWNERSHIP_TRANSFER_DECLINED:  { ...DEFAULT_NOTIFICATION_PREFS.OWNERSHIP_TRANSFER_DECLINED },
    MEMBER_LIMIT_EXCEEDED:        { ...DEFAULT_NOTIFICATION_PREFS.MEMBER_LIMIT_EXCEEDED },
    MEMBER_SUSPENDED:             { ...DEFAULT_NOTIFICATION_PREFS.MEMBER_SUSPENDED },
    MEMBER_RESTORED:              { ...DEFAULT_NOTIFICATION_PREFS.MEMBER_RESTORED },
  };

  if (!raw || typeof raw !== "object") {
    return result;
  }

  const obj = raw as Record<string, unknown>;
  for (const type of NOTIFICATION_TYPES) {
    const entry = obj[type];
    if (entry && typeof entry === "object") {
      const e = entry as { inApp?: unknown; email?: unknown };
      if (typeof e.inApp === "boolean") {
        result[type].inApp = e.inApp;
      }
      if (typeof e.email === "boolean") {
        result[type].email = e.email;
      }
    }
  }

  return result;
}

export async function getUserNotificationPreferences(
  userId: string
): Promise<NotificationPreferencesMap> {
  const pref = await db.userPreference.findUnique({
    where: { userId },
    select: { notificationPrefs: true },
  });
  return resolveNotificationPreferences(pref?.notificationPrefs);
}

/**
 * Merge a partial per-type patch into the stored preferences.
 * The read-merge-write runs under a row lock so concurrent PATCHes for
 * different types (e.g. two quick toggles) cannot overwrite each other.
 */
export async function updateUserNotificationPreferences(
  userId: string,
  updates: Partial<Record<NotificationType, Partial<NotificationChannelConfig>>>
): Promise<NotificationPreferencesMap> {
  return db.$transaction(async (tx) => {
    // Ensure the row exists so there is something to lock
    await tx.userPreference.createMany({
      data: [{ userId }],
      skipDuplicates: true,
    });

    const rows = await tx.$queryRaw<Array<{ notification_prefs: unknown }>>`
      SELECT "notification_prefs" FROM "user_preferences"
      WHERE "user_id" = ${userId}
      FOR UPDATE
    `;
    const current = resolveNotificationPreferences(rows[0]?.notification_prefs);

    for (const type of NOTIFICATION_TYPES) {
      const patch = updates[type];
      if (patch) {
        if (typeof patch.inApp === "boolean") {
          current[type].inApp = patch.inApp;
        }
        if (typeof patch.email === "boolean") {
          current[type].email = patch.email;
        }
      }
    }

    await tx.userPreference.update({
      where: { userId },
      data: {
        notificationPrefs: current as unknown as Prisma.InputJsonValue,
      },
    });

    return current;
  });
}

export interface NotifyOptions {
  dedupeKey?: string | null;
  /**
   * When a row with the same `dedupeKey` already exists, replace it instead of
   * suppressing the new one (e.g. a re-sent invitation supersedes the old one).
   */
  replaceExisting?: boolean;
  email?: boolean;
  emailData?: {
    template: EmailTemplateName;
    data: EmailTemplateMap[EmailTemplateName];
  };
}

function resolveDefaultEmailMapping(
  type: NotificationType,
  payload: Record<string, unknown>
): { template: EmailTemplateName; data: EmailTemplateMap[EmailTemplateName] } | null {
  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  switch (type) {
    case "INVITE_RECEIVED":
      return {
        template: "invitation",
        data: {
          inviterName: (payload.inviterName as string) || "A collaborator",
          teamOrProjectName:
            (payload.resourceName as string) ||
            (payload.teamOrProjectName as string) ||
            "Workspace",
          inviteUrl:
            (payload.inviteUrl as string) ||
            (payload.href ? `${appUrl}${payload.href as string}` : `${appUrl}/workspaces`),
          role: (payload.role as string) || "EDITOR",
        },
      };
    case "SHARE_CREATED":
      return {
        template: "share-created",
        data: {
          title: (payload.title as string) || "Workspace",
          shareUrl: (payload.shareUrl as string) || `${appUrl}/workspaces`,
        },
      };
    case "CREDITS_LOW":
    case "CREDITS_EXHAUSTED":
      return {
        template: "credits-low",
        data: {
          remainingCredits:
            typeof payload.remainingCredits === "number"
              ? payload.remainingCredits
              : 0,
          upgradeUrl: (payload.upgradeUrl as string) || `${appUrl}/pricing`,
        },
      };
    case "PAYMENT_FAILED":
      return {
        template: "payment-failed",
        data: {
          reason: payload.reason as string | undefined,
          retryUrl: (payload.retryUrl as string) || `${appUrl}/settings`,
        },
      };
    case "NEW_SIGN_IN":
      return {
        template: "new-sign-in",
        data: {
          time: (payload.time as string) || new Date().toUTCString(),
          device: payload.device as string | undefined,
          ipAddress: payload.ipAddress as string | undefined,
          location: payload.location as string | undefined,
        },
      };
    default:
      return null;
  }
}

async function deliverEmailWithRetry(
  to: string,
  template: EmailTemplateName,
  data: EmailTemplateMap[EmailTemplateName],
  locale?: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await sendEmail(template, to, data as never, { locale });
      if (res.success) {
        return true;
      }
    } catch {
      // retry once
    }
  }
  return false;
}

/**
 * Step 7.7: Central notification dispatcher.
 * - Writes a `Notification` row (ignoring unique-violation on `[userId, dedupeKey]`).
 * - Respects `UserPreference` per-type channels (`inApp` / `email`).
 * - Sends email inline with retry when enabled, updating `emailStatus` (`NONE` | `PENDING` | `SENT` | `FAILED`).
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {},
  options: NotifyOptions = {}
) {
  const [user, prefs] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        preference: {
          select: {
            uiLocale: true,
          },
        },
      },
    }),
    getUserNotificationPreferences(userId),
  ]);

  if (!user) {
    return { skipped: true, reason: "user_not_found" as const, notification: null };
  }

  const typePref = prefs[type] ?? { inApp: true, email: false };

  const inAppEnabled = typePref.inApp;
  const emailMapping =
    options.emailData ?? resolveDefaultEmailMapping(type, payload);
  const emailRequested =
    options.email !== undefined ? options.email : Boolean(emailMapping);
  const emailEnabled = Boolean(typePref.email && emailRequested && emailMapping);

  // If both in-app and email are disabled by user preferences, do nothing
  if (!inAppEnabled && !emailEnabled) {
    return {
      skipped: true,
      reason: "preferences_disabled" as const,
      notification: null,
    };
  }

  const dedupeKey = options.dedupeKey ?? null;
  const initialStatus: NotifStatus = inAppEnabled ? "UNREAD" : "DISMISSED";
  const initialEmailStatus: EmailStatus = emailEnabled ? "PENDING" : "NONE";

  if (dedupeKey && options.replaceExisting) {
    await db.notification.deleteMany({ where: { userId, dedupeKey } });
  }

  let created;
  try {
    created = await db.notification.create({
      data: {
        userId,
        type,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey,
        status: initialStatus,
        emailStatus: initialEmailStatus,
        ...(inAppEnabled ? {} : { dismissedAt: new Date() }),
      },
    });
  } catch (err: unknown) {
    // P2002: Unique constraint failed on (userId, dedupeKey) -> suppress duplicate
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return {
        skipped: true,
        deduped: true,
        reason: "deduped" as const,
        notification: null,
      };
    }
    throw err;
  }

  if (emailEnabled && emailMapping) {
    const delivered = await deliverEmailWithRetry(
      user.email,
      emailMapping.template,
      emailMapping.data,
      user.preference?.uiLocale ?? undefined
    );
    const finalEmailStatus: EmailStatus = delivered ? "SENT" : "FAILED";
    created = await db.notification.update({
      where: { id: created.id },
      data: { emailStatus: finalEmailStatus },
    });
  }

  return {
    skipped: false,
    deduped: false,
    notification: created,
  };
}

/**
 * List notifications for a user (excluding DISMISSED unless status=DISMISSED is explicitly requested).
 */
export async function listNotifications(
  userId: string,
  options: { status?: NotifStatus; cursor?: string; limit?: number } = {}
) {
  const limit = options.limit ?? 25;

  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(options.status
      ? { status: options.status }
      : { status: { in: ["UNREAD", "READ"] } }),
  };

  const rows = await db.notification.findMany({
    where,
    take: limit + 1,
    ...(options.cursor
      ? {
          cursor: { id: options.cursor },
          skip: 1,
        }
      : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return toPage(rows, limit);
}

/**
 * Count unread notifications for a user.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({
    where: {
      userId,
      status: "UNREAD",
    },
  });
}

/**
 * Mark a single notification as READ (strictly own-user; returns 404 if not owned by userId).
 */
export async function markNotificationRead(userId: string, notificationId: string) {
  const existing = await db.notification.findUnique({
    where: { id: notificationId },
  });

  if (!existing || existing.userId !== userId) {
    throw Errors.notFound("Notification");
  }

  // READ is a no-op; DISMISSED is final and must not resurface in the list
  if (existing.status !== "UNREAD") {
    return existing;
  }

  return db.notification.update({
    where: { id: notificationId },
    data: {
      status: "READ",
      readAt: existing.readAt ?? new Date(),
    },
  });
}

/**
 * Mark all UNREAD notifications for a user as READ.
 */
export async function markAllNotificationsRead(userId: string) {
  const now = new Date();
  const res = await db.notification.updateMany({
    where: {
      userId,
      status: "UNREAD",
    },
    data: {
      status: "READ",
      readAt: now,
    },
  });

  return { updatedCount: res.count };
}

/**
 * Dismiss a notification (`DELETE /api/v1/notifications/:id`, sets status = DISMISSED).
 * Strictly own-user; returns 404 if not owned by userId.
 */
export async function dismissNotification(userId: string, notificationId: string) {
  const existing = await db.notification.findUnique({
    where: { id: notificationId },
  });

  if (!existing || existing.userId !== userId) {
    throw Errors.notFound("Notification");
  }

  return db.notification.update({
    where: { id: notificationId },
    data: {
      status: "DISMISSED",
      dismissedAt: new Date(),
    },
  });
}

/**
 * Mark the caller's notification with this dedupe key as READ, if any
 * (e.g. clear the "invitation received" item once the invite is accepted).
 */
export async function markNotificationReadByDedupeKey(
  userId: string,
  dedupeKey: string
) {
  await db.notification.updateMany({
    where: { userId, dedupeKey, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
}
