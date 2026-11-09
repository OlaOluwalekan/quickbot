import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "INVITE_RECEIVED",
  "INVITE_ACCEPTED",
  "MEMBER_REMOVED",
  "ROLE_CHANGED",
  "SHARE_CREATED",
  "CREDITS_LOW",
  "CREDITS_EXHAUSTED",
  "PAYMENT_FAILED",
  "SUBSCRIPTION_CHANGED",
  "NEW_SIGN_IN",
  "EXPORT_READY",
  "QUESTIONS_ANSWERED",
  "OWNERSHIP_TRANSFER_REQUESTED",
  "OWNERSHIP_TRANSFER_ACCEPTED",
  "OWNERSHIP_TRANSFER_DECLINED",
  "MEMBER_LIMIT_EXCEEDED",
  "MEMBER_SUSPENDED",
  "MEMBER_RESTORED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifStatusSchema = z.enum(["UNREAD", "READ", "DISMISSED"]);

export const listNotificationsQuerySchema = z.object({
  status: notifStatusSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const notificationChannelPrefSchema = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
});

export const updateNotificationPrefsSchema = z
  .object({
    INVITE_RECEIVED: notificationChannelPrefSchema.optional(),
    INVITE_ACCEPTED: notificationChannelPrefSchema.optional(),
    MEMBER_REMOVED: notificationChannelPrefSchema.optional(),
    ROLE_CHANGED: notificationChannelPrefSchema.optional(),
    SHARE_CREATED: notificationChannelPrefSchema.optional(),
    CREDITS_LOW: notificationChannelPrefSchema.optional(),
    CREDITS_EXHAUSTED: notificationChannelPrefSchema.optional(),
    PAYMENT_FAILED: notificationChannelPrefSchema.optional(),
    SUBSCRIPTION_CHANGED: notificationChannelPrefSchema.optional(),
    NEW_SIGN_IN: notificationChannelPrefSchema.optional(),
    EXPORT_READY: notificationChannelPrefSchema.optional(),
    QUESTIONS_ANSWERED: notificationChannelPrefSchema.optional(),
    OWNERSHIP_TRANSFER_REQUESTED: notificationChannelPrefSchema.optional(),
    OWNERSHIP_TRANSFER_ACCEPTED: notificationChannelPrefSchema.optional(),
    OWNERSHIP_TRANSFER_DECLINED: notificationChannelPrefSchema.optional(),
    MEMBER_LIMIT_EXCEEDED: notificationChannelPrefSchema.optional(),
    MEMBER_SUSPENDED: notificationChannelPrefSchema.optional(),
    MEMBER_RESTORED: notificationChannelPrefSchema.optional(),
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type UpdateNotificationPrefsInput = z.infer<typeof updateNotificationPrefsSchema>;
