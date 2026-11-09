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
import {
  formatNotificationPresentation,
  type NotificationItemDto,
} from "./NotificationBell";
import type { NotificationType } from "@/lib/schemas/notification";

interface NotificationTypeMeta {
  type: NotificationType;
  label: string;
  description: string;
}

// PAYMENT_FAILED, SUBSCRIPTION_CHANGED and EXPORT_READY are reserved types with
// no sender yet (no billing webhook; exports are synchronous downloads), so they
// are not offered here until something emits them.
const NOTIFICATION_TYPE_METADATA: NotificationTypeMeta[] = [
  {
    type: "INVITE_RECEIVED",
    label: "Invitation received",
    description: "When someone invites you to collaborate on a workspace or project.",
  },
  {
    type: "INVITE_ACCEPTED",
    label: "Invitation accepted",
    description: "When a collaborator accepts an invitation you sent.",
  },
  {
    type: "MEMBER_REMOVED",
    label: "Removed from workspace",
    description: "When your access to a workspace or project is removed.",
  },
  {
    type: "ROLE_CHANGED",
    label: "Role changed",
    description: "When your role in a workspace or project is updated.",
  },
  {
    type: "SHARE_CREATED",
    label: "Public share link created",
    description: "When a public share link is created on a workspace you own.",
  },
  {
    type: "CREDITS_LOW",
    label: "Credits low (80%)",
    description: "When 80% of your monthly credit allowance has been used.",
  },
  {
    type: "CREDITS_EXHAUSTED",
    label: "Credits exhausted (100%)",
    description: "When your monthly credit allowance reaches 0.",
  },
  {
    type: "NEW_SIGN_IN",
    label: "New device sign-in",
    description: "When your account is accessed from a new browser, OS, or country.",
  },
  {
    type: "QUESTIONS_ANSWERED",
    label: "Queued questions answered",
    description: "When a batch of queued passage questions finishes answering.",
  },
  {
    type: "OWNERSHIP_TRANSFER_REQUESTED",
    label: "Ownership transfer request",
    description: "When someone asks you to take over a workspace or project.",
  },
  {
    type: "OWNERSHIP_TRANSFER_ACCEPTED",
    label: "Ownership transfer accepted",
    description: "When the person you chose accepts ownership.",
  },
  {
    type: "OWNERSHIP_TRANSFER_DECLINED",
    label: "Ownership transfer declined",
    description: "When the person you chose declines ownership.",
  },
  {
    type: "MEMBER_LIMIT_EXCEEDED",
    label: "Collaborator limit exceeded",
    description: "When an owner's plan no longer covers all collaborators.",
  },
  {
    type: "MEMBER_SUSPENDED",
    label: "Access changed to read-only",
    description: "When your access becomes read-only because of a plan limit.",
  },
  {
    type: "MEMBER_RESTORED",
    label: "Access restored",
    description: "When your full access comes back.",
  },
];

export function NotificationsSettingsView() {
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
      toast.error("Failed to load notification preferences");
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

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
      toast.error("Failed to load notifications");
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

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
      toast.success("Preference saved");
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
      toast.error("Failed to update notification preference");
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
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
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
            Notification Channels
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Choose which events notify you in-app and by email. Changes are saved automatically.
          </p>
        </div>

        {loadingPrefs ? (
          <div className="py-10 flex justify-center">
            <Spinner className="h-6 w-6 text-accent" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="hidden sm:grid sm:grid-cols-12 pb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              <div className="col-span-8">Event</div>
              <div className="col-span-2 text-center flex items-center justify-center gap-1">
                <Smartphone className="h-3.5 w-3.5" />
                <span>In-app</span>
              </div>
              <div className="col-span-2 text-center flex items-center justify-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                <span>Email</span>
              </div>
            </div>

            {NOTIFICATION_TYPE_METADATA.map((meta) => {
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
                        In-app
                      </span>
                      <Switch
                        checked={Boolean(entry.inApp)}
                        onCheckedChange={(val) =>
                          handleToggleChannel(meta.type, "inApp", val)
                        }
                        aria-label={`${meta.label} in-app notifications`}
                      />
                    </div>

                    <div className="flex items-center sm:justify-center gap-2">
                      <span className="text-xs text-muted sm:hidden">
                        Email
                      </span>
                      <Switch
                        checked={Boolean(entry.email)}
                        onCheckedChange={(val) =>
                          handleToggleChannel(meta.type, "email", val)
                        }
                        aria-label={`${meta.label} email notifications`}
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
              <span>Recent Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {unreadCount} unread
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Your recent account and workspace activity alerts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-border bg-surface-2 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-surface text-fg shadow-2xs"
                    : "text-muted hover:text-fg"
                }`}
              >
                All
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
                Unread
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
                <span>Mark all read</span>
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
            <p className="text-sm font-medium text-fg">No notifications found</p>
            <p className="text-xs text-muted">
              {statusFilter === "UNREAD"
                ? "You have no unread notifications."
                : "Notifications will appear here when important events happen."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => {
              const info = formatNotificationPresentation(item);
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
                            Unread
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted leading-relaxed">
                        {info.description}
                      </p>
                      <p className="text-[11px] text-subtle">
                        {new Date(item.createdAt).toLocaleString()}
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
                        onClick={() => handleMarkRead(item.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Mark read</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted hover:text-danger"
                      title="Dismiss"
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
