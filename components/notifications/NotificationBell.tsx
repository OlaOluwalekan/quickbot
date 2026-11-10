"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  X,
  AtSign,
  UserPlus,
  UserCheck,
  UserMinus,
  Shield,
  Globe,
  AlertTriangle,
  CreditCard,
  Laptop,
  FileDown,
  MessageSquare,
  Settings,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";

export interface NotificationItemDto {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, unknown> | null;
  status: "UNREAD" | "READ" | "DISMISSED";
  emailStatus: "NONE" | "PENDING" | "SENT" | "FAILED";
  createdAt: string;
  readAt: string | null;
}

type NotificationsTranslator = ReturnType<typeof useTranslations>;

const ROLE_KEYS = ["OWNER", "ADMIN", "EDITOR", "COMMENTER", "VIEWER"];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Title, description, link and icon of a notification, in the viewer's
 * language. `t` is `useTranslations("Notifications")`. Texts are built from
 * the payload's data (names, counts), never from server-written sentences.
 */
export function formatNotificationPresentation(
  item: NotificationItemDto,
  t: NotificationsTranslator
): {
  title: string;
  description: string;
  href: string | null;
  icon: React.ReactNode;
} {
  const p = (item.payload || {}) as Record<string, unknown>;
  const href = typeof p.href === "string" ? p.href : null;

  const title = (key: string) => t(`items.${key}.title`);
  const desc = (key: string, variant = "description", values?: Record<string, string | number>) =>
    t(`items.${key}.${variant}`, values);
  const role = (value: unknown) => {
    const raw = text(value);
    if (!raw) return null;
    return ROLE_KEYS.includes(raw) ? t(`roles.${raw}`) : raw;
  };
  const resourceName = text(p.resourceName);

  switch (item.type) {
    case "INVITE_RECEIVED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          inviterName: text(p.inviterName) ?? t("fallback.someone"),
          resourceName: resourceName ?? t("fallback.workspace"),
          role: role(p.role) ?? t("fallback.role"),
        }),
        href: href || "/workspaces",
        icon: <UserPlus className="h-4 w-4 text-accent" />,
      };
    case "INVITE_ACCEPTED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          name: text(p.acceptedByName) ?? t("fallback.collaborator"),
        }),
        href: href || "/workspaces",
        icon: <UserCheck className="h-4 w-4 text-accent" />,
      };
    case "MEMBER_REMOVED":
      return {
        title: title(item.type),
        description: resourceName
          ? desc(item.type, "descriptionNamed", { resourceName })
          : desc(item.type),
        href: href || "/workspaces",
        icon: <UserMinus className="h-4 w-4 text-danger" />,
      };
    case "ROLE_CHANGED": {
      const oldRole = role(p.oldRole);
      const newRole = role(p.newRole);
      return {
        title: title(item.type),
        description:
          oldRole && newRole
            ? desc(item.type, "descriptionRoles", { oldRole, newRole })
            : desc(item.type),
        href: href || "/workspaces",
        icon: <Shield className="h-4 w-4 text-accent" />,
      };
    }
    case "SHARE_CREATED":
      return {
        title: title(item.type),
        description: desc(
          item.type,
          p.scope === "RESPONSE" ? "descriptionResponse" : "descriptionWorkspace"
        ),
        href: href || "/workspaces",
        icon: <Globe className="h-4 w-4 text-accent" />,
      };
    case "CREDITS_LOW":
      return {
        title: title(item.type),
        description:
          typeof p.remainingCredits === "number"
            ? desc(item.type, "descriptionCount", { count: p.remainingCredits })
            : desc(item.type),
        href: href || "/settings",
        icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      };
    case "CREDITS_EXHAUSTED":
      return {
        title: title(item.type),
        description: desc(item.type),
        href: href || "/settings",
        icon: <AlertTriangle className="h-4 w-4 text-danger" />,
      };
    case "PAYMENT_FAILED":
      return {
        title: title(item.type),
        description: desc(item.type),
        href: href || "/settings",
        icon: <CreditCard className="h-4 w-4 text-danger" />,
      };
    case "SUBSCRIPTION_CHANGED":
      return {
        title: title(item.type),
        description: desc(item.type),
        href: href || "/settings",
        icon: <CreditCard className="h-4 w-4 text-accent" />,
      };
    case "NEW_SIGN_IN": {
      const device = text(p.device) ?? t("fallback.device");
      const location = text(p.location);
      return {
        title: title(item.type),
        description: location
          ? desc(item.type, "descriptionLocation", { device, location })
          : desc(item.type, "description", { device }),
        href: href || "/settings/sessions",
        icon: <Laptop className="h-4 w-4 text-warning" />,
      };
    }
    case "EXPORT_READY":
      return {
        title: title(item.type),
        description: desc(item.type),
        href,
        icon: <FileDown className="h-4 w-4 text-accent" />,
      };
    case "QUESTIONS_ANSWERED":
      return {
        title: title(item.type),
        description:
          typeof p.answeredCount !== "number"
            ? desc(item.type)
            : p.answeredCount === 1
              ? desc(item.type, "descriptionOne")
              : desc(item.type, "descriptionCount", { count: p.answeredCount }),
        href: href || "/workspaces",
        icon: <MessageSquare className="h-4 w-4 text-accent" />,
      };
    case "OWNERSHIP_TRANSFER_REQUESTED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          name: text(p.fromUserName) ?? t("fallback.someone"),
          resourceName: resourceName ?? t("fallback.workspace"),
        }),
        href: href || "/workspaces",
        icon: <Crown className="h-4 w-4 text-accent" />,
      };
    case "OWNERSHIP_TRANSFER_ACCEPTED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          name: text(p.toUserName) ?? t("fallback.recipient"),
          resourceName: resourceName ?? t("fallback.yourWorkspace"),
        }),
        href: p.previousOwnerAction === "LEAVE" ? null : href,
        icon: <Crown className="h-4 w-4 text-accent" />,
      };
    case "OWNERSHIP_TRANSFER_DECLINED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          name: text(p.toUserName) ?? t("fallback.recipient"),
          resourceName: resourceName ?? t("fallback.yourWorkspace"),
        }),
        href,
        icon: <Crown className="h-4 w-4 text-muted" />,
      };
    case "MEMBER_LIMIT_EXCEEDED":
      return {
        title: title(item.type),
        description:
          p.isOwner !== true
            ? desc(item.type)
            : typeof p.limit === "number"
              ? desc(item.type, "descriptionOwnerLimit", { limit: p.limit })
              : desc(item.type, "descriptionOwner"),
        href: href || "/workspaces",
        icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      };
    case "MEMBER_SUSPENDED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          resourceName: resourceName ?? t("fallback.workspace"),
        }),
        href: href || "/workspaces",
        icon: <UserMinus className="h-4 w-4 text-warning" />,
      };
    case "MEMBER_RESTORED":
      return {
        title: title(item.type),
        description: desc(item.type, "description", {
          resourceName: resourceName ?? t("fallback.workspace"),
        }),
        href: href || "/workspaces",
        icon: <UserCheck className="h-4 w-4 text-accent" />,
      };
    case "MENTIONED": {
      const name = text(p.authorName) ?? t("fallback.someone");
      const quote = text(p.quote);
      return {
        title: title(item.type),
        description: quote
          ? desc(item.type, "descriptionQuote", {
              name,
              quote: quote.length > 80 ? `${quote.slice(0, 79)}…` : quote,
            })
          : desc(item.type, "description", { name }),
        href: href || "/workspaces",
        icon: <AtSign className="h-4 w-4 text-accent" />,
      };
    }
    default:
      return {
        title: title("default"),
        description: desc("default"),
        href,
        icon: <Bell className="h-4 w-4 text-accent" />,
      };
  }
}

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const format = useFormatter();
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [items, setItems] = React.useState<NotificationItemDto[]>([]);
  const [loadingList, setLoadingList] = React.useState(false);

  const fetchUnreadCount = React.useCallback(async () => {
    try {
      const res = await fetch("/api/v1/notifications/unread-count", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data ?? json;
      if (typeof data?.count === "number") {
        setUnreadCount(data.count);
      }
    } catch {
      // Ignore transient network errors during background polling
    }
  }, []);

  const fetchNotificationsList = React.useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/v1/notifications?limit=15", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data ?? json;
      const list = Array.isArray(data?.items)
        ? (data.items as NotificationItemDto[])
        : [];
      setItems(list);
      const unreadInList = list.filter((i) => i.status === "UNREAD").length;
      setUnreadCount((prev) => Math.max(prev, unreadInList));
    } catch {
      // Ignore network errors
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Poll unread count every 60s and on window focus (no websockets)
  React.useEffect(() => {
    void fetchUnreadCount();

    const interval = window.setInterval(() => {
      void fetchUnreadCount();
    }, 60_000);

    const handleFocus = () => {
      void fetchUnreadCount();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchUnreadCount]);

  React.useEffect(() => {
    if (open) {
      void fetchNotificationsList();
      void fetchUnreadCount();
    }
  }, [open, fetchNotificationsList, fetchUnreadCount]);

  const handleMarkRead = async (id: string) => {
    const target = items.find((i) => i.id === id);
    if (!target || target.status === "READ") return;

    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "READ" } : i))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      void fetchNotificationsList();
      void fetchUnreadCount();
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, status: "READ" })));
    setUnreadCount(0);

    try {
      const res = await fetch("/api/v1/notifications/read-all", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("bell.allMarkedRead"));
    } catch {
      toast.error(t("bell.markAllFailed"));
      void fetchNotificationsList();
      void fetchUnreadCount();
    }
  };

  const handleDismiss = async (id: string) => {
    const target = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (target?.status === "UNREAD") {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      const res = await fetch(`/api/v1/notifications/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      void fetchNotificationsList();
      void fetchUnreadCount();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? t("bell.labelUnread", { count: unreadCount })
              : t("bell.label")
          }
          className="relative"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span
              data-testid="notification-unread-badge"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg shadow-2xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 sm:w-96 p-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface-2/40">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">{t("bell.title")}</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                {t("bell.newCount", { count: unreadCount })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-7 px-2 text-xs text-muted hover:text-fg gap-1"
                title={t("bell.markAllReadTitle")}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{t("bell.markAllRead")}</span>
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted hover:text-fg"
              title={t("bell.settings")}
              aria-label={t("bell.settings")}
              onClick={() => setOpen(false)}
            >
              <Link href="/settings/notifications">
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-border">
          {loadingList && items.length === 0 ? (
            <div className="py-10 flex items-center justify-center">
              <Spinner className="h-5 w-5 text-accent" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-1">
              <Bell className="h-6 w-6 text-subtle mx-auto mb-1.5 opacity-60" />
              <p className="text-xs font-medium text-fg">{t("bell.empty")}</p>
              <p className="text-[11px] text-muted">
                {t("bell.emptyHint")}
              </p>
            </div>
          ) : (
            items.map((item) => {
              const info = formatNotificationPresentation(item, t);
              const isUnread = item.status === "UNREAD";

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 p-3.5 text-xs transition-colors hover:bg-surface-2/60",
                    isUnread && "bg-accent/5"
                  )}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                    {info.icon}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      {info.href ? (
                        <Link
                          href={info.href}
                          onClick={() => {
                            if (isUnread) void handleMarkRead(item.id);
                            setOpen(false);
                          }}
                          className={cn(
                            "font-semibold text-fg hover:text-accent transition-colors leading-snug",
                            isUnread && "text-fg"
                          )}
                        >
                          {info.title}
                        </Link>
                      ) : (
                        <span className="font-semibold text-fg leading-snug">
                          {info.title}
                        </span>
                      )}

                      {isUnread && (
                        <span
                          role="img"
                          aria-label={t("bell.unread")}
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
                        />
                      )}
                    </div>

                    <p className="text-muted text-[11px] leading-relaxed line-clamp-2">
                      {info.description}
                    </p>

                    <p className="text-[10px] text-subtle">
                      {format.dateTime(new Date(item.createdAt), {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {isUnread && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted hover:text-accent"
                        title={t("bell.markRead")}
                        aria-label={t("bell.markRead")}
                        onClick={() => handleMarkRead(item.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted hover:text-danger"
                      title={t("bell.dismiss")}
                      aria-label={t("bell.dismiss")}
                      onClick={() => handleDismiss(item.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-surface-2/40 px-4 py-2.5 text-center">
          <Link
            href="/settings/notifications"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-accent hover:underline"
          >
            {t("bell.viewAll")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
