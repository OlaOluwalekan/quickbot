"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  X,
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

export function formatNotificationPresentation(item: NotificationItemDto): {
  title: string;
  description: string;
  href: string | null;
  icon: React.ReactNode;
} {
  const p = (item.payload || {}) as Record<string, unknown>;
  const href = typeof p.href === "string" ? p.href : null;

  switch (item.type) {
    case "INVITE_RECEIVED":
      return {
        title: "New invitation received",
        description: `${(p.inviterName as string) || "Someone"} invited you to join ${(p.resourceName as string) || "a workspace"} as ${(p.role as string) || "a collaborator"}.`,
        href: href || "/workspaces",
        icon: <UserPlus className="h-4 w-4 text-accent" />,
      };
    case "INVITE_ACCEPTED":
      return {
        title: "Invitation accepted",
        description: `${(p.acceptedByName as string) || "A collaborator"} accepted your invitation.`,
        href: href || "/workspaces",
        icon: <UserCheck className="h-4 w-4 text-accent" />,
      };
    case "MEMBER_REMOVED":
      return {
        title: "Removed from workspace",
        description:
          (p.message as string) ||
          "Your access to a shared workspace or project was removed.",
        href: href || "/workspaces",
        icon: <UserMinus className="h-4 w-4 text-danger" />,
      };
    case "ROLE_CHANGED":
      return {
        title: "Role updated",
        description: `Your role was changed from ${(p.oldRole as string) || "member"} to ${(p.newRole as string) || "updated role"}.`,
        href: href || "/workspaces",
        icon: <Shield className="h-4 w-4 text-accent" />,
      };
    case "SHARE_CREATED":
      return {
        title: "Public share link created",
        description: `A public ${p.scope === "RESPONSE" ? "response" : "workspace"} share link was created.`,
        href: href || "/workspaces",
        icon: <Globe className="h-4 w-4 text-accent" />,
      };
    case "CREDITS_LOW":
      return {
        title: "Credits running low (80% used)",
        description: `You have ${typeof p.remainingCredits === "number" ? p.remainingCredits : "few"} credits remaining this period.`,
        href: href || "/settings",
        icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      };
    case "CREDITS_EXHAUSTED":
      return {
        title: "Out of credits (100% used)",
        description:
          "Your monthly credit allowance has been exhausted. Upgrade or top up to continue generating.",
        href: href || "/settings",
        icon: <AlertTriangle className="h-4 w-4 text-danger" />,
      };
    case "PAYMENT_FAILED":
      return {
        title: "Payment failed",
        description:
          (p.reason as string) ||
          "We could not process your subscription payment. Please update your payment method.",
        href: href || "/settings",
        icon: <CreditCard className="h-4 w-4 text-danger" />,
      };
    case "SUBSCRIPTION_CHANGED":
      return {
        title: "Subscription updated",
        description:
          (p.message as string) || "Your subscription plan has been updated.",
        href: href || "/settings",
        icon: <CreditCard className="h-4 w-4 text-accent" />,
      };
    case "NEW_SIGN_IN":
      return {
        title: "New sign-in detected",
        description: `Signed in from ${(p.device as string) || "a new device"}${p.location ? ` (${p.location as string})` : ""}.`,
        href: href || "/settings/sessions",
        icon: <Laptop className="h-4 w-4 text-warning" />,
      };
    case "EXPORT_READY":
      return {
        title: "Export ready",
        description:
          (p.message as string) || "Your exported document is ready to download.",
        href: href,
        icon: <FileDown className="h-4 w-4 text-accent" />,
      };
    case "QUESTIONS_ANSWERED":
      return {
        title: "Queued questions answered",
        description: `${typeof p.answeredCount === "number" ? p.answeredCount : "Your"} queued question${p.answeredCount === 1 ? " was" : "s were"} answered.`,
        href: href || "/workspaces",
        icon: <MessageSquare className="h-4 w-4 text-accent" />,
      };
    // F1.3 — English like the rest of this file; moved to next-intl with it in F5.1.
    case "OWNERSHIP_TRANSFER_REQUESTED":
      return {
        title: "Ownership transfer request",
        description: `${(p.fromUserName as string) || "Someone"} wants to transfer ownership of ${(p.resourceName as string) || "a workspace"} to you. If you accept, you pay for all usage there.`,
        href: href || "/workspaces",
        icon: <Crown className="h-4 w-4 text-accent" />,
      };
    case "OWNERSHIP_TRANSFER_ACCEPTED":
      return {
        title: "Ownership transfer accepted",
        description: `${(p.toUserName as string) || "The recipient"} is now the owner of ${(p.resourceName as string) || "your workspace"}.`,
        href: p.previousOwnerAction === "LEAVE" ? null : href,
        icon: <Crown className="h-4 w-4 text-accent" />,
      };
    case "OWNERSHIP_TRANSFER_DECLINED":
      return {
        title: "Ownership transfer declined",
        description: `${(p.toUserName as string) || "The recipient"} declined to take over ${(p.resourceName as string) || "your workspace"}.`,
        href,
        icon: <Crown className="h-4 w-4 text-muted" />,
      };
    case "MEMBER_LIMIT_EXCEEDED":
      return {
        title: "Collaborator limit exceeded",
        description:
          p.isOwner === true
            ? `Your plan allows ${typeof p.limit === "number" ? p.limit : "fewer"} collaborators. Choose who stays active in Share & people.`
            : "The owner's plan no longer covers all collaborators. Some members may become read-only soon.",
        href: href || "/workspaces",
        icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      };
    case "MEMBER_SUSPENDED":
      return {
        title: "Access changed to read-only",
        description: `Your access to ${(p.resourceName as string) || "a workspace"} is read-only because the owner's plan no longer covers all collaborators.`,
        href: href || "/workspaces",
        icon: <UserMinus className="h-4 w-4 text-warning" />,
      };
    case "MEMBER_RESTORED":
      return {
        title: "Access restored",
        description: `Your full access to ${(p.resourceName as string) || "a workspace"} is back.`,
        href: href || "/workspaces",
        icon: <UserCheck className="h-4 w-4 text-accent" />,
      };
    default:
      return {
        title: (p.title as string) || item.type.replace(/_/g, " "),
        description: (p.message as string) || "You have a new notification.",
        href,
        icon: <Bell className="h-4 w-4 text-accent" />,
      };
  }
}

export function NotificationBell() {
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
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
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
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
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
            <span className="text-sm font-semibold text-fg">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                {unreadCount} new
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
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted hover:text-fg"
              title="Notification settings"
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
              <p className="text-xs font-medium text-fg">No notifications</p>
              <p className="text-[11px] text-muted">
                You&apos;re all caught up.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const info = formatNotificationPresentation(item);
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
                          aria-label="Unread"
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent"
                        />
                      )}
                    </div>

                    <p className="text-muted text-[11px] leading-relaxed line-clamp-2">
                      {info.description}
                    </p>

                    <p className="text-[10px] text-subtle">
                      {new Date(item.createdAt).toLocaleString(undefined, {
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
                        title="Mark as read"
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
                      title="Dismiss"
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
            View all notifications & preferences
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
