"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  X,
  Mail,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import {
  formatNotificationPresentation,
  type NotificationItemDto,
} from "./NotificationBell";
import type { NotificationType } from "@/lib/schemas/notification";

// PAYMENT_FAILED, SUBSCRIPTION_CHANGED and EXPORT_READY are reserved types with
// no sender yet (no billing webhook; exports are synchronous downloads), so they
// are not offered here until something emits them.
// Labels: Notifications.labels.<TYPE>; descriptions: Notifications.types.<TYPE>.
const OFFERED_TYPES: NotificationType[] = [
  "INVITE_RECEIVED",
  "INVITE_ACCEPTED",
  "MEMBER_REMOVED",
  "ROLE_CHANGED",
  "SHARE_CREATED",
  "CREDITS_LOW",
  "CREDITS_EXHAUSTED",
  "NEW_SIGN_IN",
  "QUESTIONS_ANSWERED",
  "OWNERSHIP_TRANSFER_REQUESTED",
  "OWNERSHIP_TRANSFER_ACCEPTED",
  "OWNERSHIP_TRANSFER_DECLINED",
  "MEMBER_LIMIT_EXCEEDED",
  "MEMBER_SUSPENDED",
  "MEMBER_RESTORED",
  "MENTIONED",
];

export function NotificationsSettingsView() {
  const t = useTranslations("Notifications");
  const format = useFormatter();
  const [prefs, setPrefs] = React.useState<
    Record<string, { inApp: boolean; email: boolean }>
  >({});
  const [loadingPrefs, setLoadingPrefs] = React.useState(true);

  const [items, setItems] = React.useState<NotificationItemDto[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | "UNREAD">(
    "ALL"
  );

  const fetchPreferences = React.useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await fetch("/api/v1/me/notification-preferences");
      if (res.ok) {
        const json = await res.json();
        const data = json?.data ?? json;
        if (data?.preferences) {
          setPrefs(data.preferences);
        }
      }
    } catch {
      toast.error(t("settings.loadPrefsFailed"));
    } finally {
      setLoadingPrefs(false);
    }
  }, [t]);

  const fetchList = React.useCallback(async () => {
    setLoadingList(true);
    try {
      const query =
        statusFilter === "UNREAD" ? "?status=UNREAD&limit=50" : "?limit=50";
      const res = await fetch(`/api/v1/notifications${query}`);
      if (res.ok) {
        const json = await res.json();
        const data = json?.data ?? json;
        setItems(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      toast.error(t("settings.loadFailed"));
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, t]);

  React.useEffect(() => {
    void fetchPreferences();
  }, [fetchPreferences]);

  React.useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleToggleChannel = async (
    type: NotificationType,
    channel: "inApp" | "email",
    nextVal: boolean
  ) => {
    setPrefs((prev) => ({
      ...prev,
      [type]: {
        ...(prev[type] ?? { inApp: true, email: false }),
        [channel]: nextVal,
      },
    }));

    try {
      const res = await fetch("/api/v1/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [type]: { [channel]: nextVal },
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("settings.saved"));
    } catch {
      // Roll back only this channel, so a failure can't undo other toggles
      // that succeeded in the meantime
      setPrefs((prev) => ({
        ...prev,
        [type]: {
          ...(prev[type] ?? { inApp: true, email: false }),
          [channel]: !nextVal,
        },
      }));
      toast.error(t("settings.saveFailed"));
    }
  };

  const handleMarkRead = async (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "READ" } : i))
    );
    try {
      await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    } catch {
      void fetchList();
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, status: "READ" })));
    try {
      await fetch("/api/v1/notifications/read-all", { method: "POST" });
      toast.success(t("settings.allMarkedRead"));
    } catch {
      toast.error(t("settings.markAllFailed"));
      void fetchList();
    }
  };

  const handleDismiss = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/v1/notifications/${id}`, { method: "DELETE" });
    } catch {
      void fetchList();
    }
  };

  const unreadCount = items.filter((i) => i.status === "UNREAD").length;

  return (
    <div className="space-y-8">
      {/* Per-Type Channel Preferences */}
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold text-fg">
            {t("settings.channelsTitle")}
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            {t("settings.channelsDescription")}
          </p>
        </div>

        {loadingPrefs ? (
          <div className="py-10 flex justify-center">
            <Spinner className="h-6 w-6 text-accent" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="hidden sm:grid sm:grid-cols-12 pb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              <div className="col-span-8">{t("settings.event")}</div>
              <div className="col-span-2 text-center flex items-center justify-center gap-1">
                <Smartphone className="h-3.5 w-3.5" />
                <span>{t("settings.inApp")}</span>
              </div>
              <div className="col-span-2 text-center flex items-center justify-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                <span>{t("settings.email")}</span>
              </div>
            </div>

            {OFFERED_TYPES.map((type) => {
              const meta = {
                type,
                label: t(`labels.${type}`),
                description: t(`types.${type}`),
              };
              const entry = prefs[meta.type] ?? { inApp: true, email: false };
              return (
                <div
                  key={meta.type}
                  className="py-4 flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:items-center"
                >
                  <div className="sm:col-span-8 space-y-0.5">
                    <div className="text-sm font-semibold text-fg">
                      {meta.label}
                    </div>
                    <p className="text-xs text-muted">{meta.description}</p>
                  </div>

                  <div className="sm:col-span-4 flex items-center justify-between sm:grid sm:grid-cols-2 gap-4 pt-1 sm:pt-0">
                    <div className="flex items-center sm:justify-center gap-2">
                      <span className="text-xs text-muted sm:hidden">
                        {t("settings.inApp")}
                      </span>
                      <Switch
                        checked={Boolean(entry.inApp)}
                        onCheckedChange={(val) =>
                          handleToggleChannel(meta.type, "inApp", val)
                        }
                        aria-label={t("settings.inAppFor", { label: meta.label })}
                      />
                    </div>

                    <div className="flex items-center sm:justify-center gap-2">
                      <span className="text-xs text-muted sm:hidden">
                        {t("settings.email")}
                      </span>
                      <Switch
                        checked={Boolean(entry.email)}
                        onCheckedChange={(val) =>
                          handleToggleChannel(meta.type, "email", val)
                        }
                        aria-label={t("settings.emailFor", { label: meta.label })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Full Notifications List */}
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-fg flex items-center gap-2">
              <span>{t("settings.recentTitle")}</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {t("settings.unreadCount", { count: unreadCount })}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {t("settings.recentDescription")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t("settings.filter")}
              className="inline-flex rounded-xl border border-border bg-surface-2 p-0.5 text-xs"
            >
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-surface text-fg shadow-2xs"
                    : "text-muted hover:text-fg"
                }`}
              >
                {t("settings.filterAll")}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("UNREAD")}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  statusFilter === "UNREAD"
                    ? "bg-surface text-fg shadow-2xs"
                    : "text-muted hover:text-fg"
                }`}
              >
                {t("settings.filterUnread")}
              </button>
            </div>

            {unreadCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-8 text-xs gap-1.5"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{t("settings.markAllRead")}</span>
              </Button>
            )}
          </div>
        </div>

        {loadingList ? (
          <div className="py-12 flex justify-center">
            <Spinner className="h-6 w-6 text-accent" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center space-y-1">
            <Bell className="h-6 w-6 text-subtle mx-auto mb-1 opacity-60" />
            <p className="text-sm font-medium text-fg">{t("settings.emptyTitle")}</p>
            <p className="text-xs text-muted">
              {statusFilter === "UNREAD"
                ? t("settings.emptyUnread")
                : t("settings.emptyAll")}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => {
              const info = formatNotificationPresentation(item, t);
              const isUnread = item.status === "UNREAD";

              return (
                <div
                  key={item.id}
                  className={`flex items-start justify-between gap-3 rounded-xl border border-border p-4 transition-colors ${
                    isUnread ? "bg-accent/5" : "bg-surface"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2">
                      {info.icon}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {info.href ? (
                          <Link
                            href={info.href}
                            onClick={() => {
                              if (isUnread) void handleMarkRead(item.id);
                            }}
                            className="text-sm font-semibold text-fg hover:text-accent transition-colors"
                          >
                            {info.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-fg">
                            {info.title}
                          </span>
                        )}
                        {isUnread && (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("settings.unread")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        {info.description}
                      </p>
                      <p className="text-[11px] text-subtle">
                        {format.dateTime(new Date(item.createdAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isUnread && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted hover:text-accent gap-1"
                        aria-label={t("settings.markRead")}
                        onClick={() => handleMarkRead(item.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t("settings.markRead")}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted hover:text-danger"
                      title={t("settings.dismiss")}
                      aria-label={t("settings.dismiss")}
                      onClick={() => handleDismiss(item.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
