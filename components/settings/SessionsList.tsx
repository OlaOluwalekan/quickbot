"use client";

import * as React from "react";
import {
  Laptop,
  Smartphone,
  Globe,
  Clock,
  LogOut,
  Loader2,
  ShieldAlert,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface SessionItem {
  id: string;
  current: boolean;
  deviceLabel: string;
  os: string;
  browser: string;
  country: string | null;
  ip: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  client: "web" | "mobile";
}

export function SessionsList() {
  const [sessions, setSessions] = React.useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = React.useState(false);

  // Re-auth dialog state for sensitive actions
  const [reAuthDialogOpen, setReAuthDialogOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [pendingScope, setPendingScope] = React.useState<"others" | "all" | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = React.useState(false);

  // Reference time for "last active" labels. Kept in state so render stays pure,
  // and refreshed whenever sessions load and once a minute after that.
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const fetchSessions = React.useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/sessions");
      if (!res.ok) throw new Error("Failed to load sessions");
      const json = await res.json();
      setSessions(json.data || []);
      setNow(Date.now());
    } catch {
      toast.error("Could not load active sessions");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSingle = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      const res = await fetch(`/api/v1/me/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || "Failed to revoke session");
      }
      toast.success("Device signed out");
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke session";
      toast.error(msg);
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async (pw?: string) => {
    setIsRevokingOthers(true);
    try {
      const res = await fetch("/api/v1/me/sessions?scope=others", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pw ? { password: pw } : {}),
      });

      if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson?.error?.code === "FRESH_LOGIN_REQUIRED") {
          setPendingScope("others");
          setReAuthDialogOpen(true);
          return;
        }
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Failed to revoke other sessions");
      }

      toast.success("Signed out of all other devices");
      setReAuthDialogOpen(false);
      setPassword("");
      await fetchSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke sessions";
      toast.error(msg);
    } finally {
      setIsRevokingOthers(false);
      setIsSubmittingPassword(false);
    }
  };

  const handleConfirmPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error("Please enter your password");
      return;
    }
    setIsSubmittingPassword(true);
    if (pendingScope === "others") {
      await handleRevokeOthers(password);
    }
  };

  const formatRelativeTime = (dateStr: string, isCurrent: boolean) => {
    if (isCurrent) return "Active now";
    try {
      const d = new Date(dateStr);
      const diffSecs = Math.max(0, Math.floor((now - d.getTime()) / 1000));
      if (diffSecs < 60) return "Just now";
      if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
      if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
      return `${Math.floor(diffSecs / 86400)}d ago`;
    } catch {
      return "Recently";
    }
  };

  const otherSessionsCount = sessions.filter((s) => !s.current).length;

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-fg">Active Sessions</h2>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Manage devices signed into your account and revoke access remotely.
          </p>
        </div>
        {otherSessionsCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRevokeOthers()}
            disabled={isRevokingOthers}
            className="text-danger hover:text-accent-fg hover:bg-danger border-danger/30 text-xs shrink-0 self-start sm:self-center"
          >
            {isRevokingOthers ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Signing out...
              </>
            ) : (
              <>
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign out of all other devices
              </>
            )}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Loading active sessions...</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          No active sessions found.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sessions.map((session) => {
            const isMobile = session.client === "mobile";
            const isCurrent = session.current;
            const isRevokingThis = revokingId === session.id;

            return (
              <div
                key={session.id}
                className={cn(
                  "p-4 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4",
                  isCurrent
                    ? "bg-surface-2/60 border-primary/30"
                    : "bg-surface border-border hover:border-border/80"
                )}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={cn(
                      "p-2.5 rounded-lg shrink-0 mt-0.5",
                      isCurrent
                        ? "bg-primary/10 text-primary"
                        : "bg-surface-2 text-muted"
                    )}
                  >
                    {isMobile ? (
                      <Smartphone className="w-5 h-5" />
                    ) : (
                      <Laptop className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-fg truncate">
                        {session.deviceLabel}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/15 text-success border border-success/30">
                          <CheckCircle2 className="w-3 h-3" />
                          This device
                        </span>
                      )}
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-muted uppercase font-mono">
                        {session.client}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                      <span>
                        {session.browser} • {session.os}
                      </span>
                      {session.country && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {session.country}
                        </span>
                      )}
                      {session.ip && (
                        <span className="font-mono text-[11px]">
                          {session.ip}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>Last active: {formatRelativeTime(session.lastActiveAt, isCurrent)}</span>
                    </div>
                  </div>
                </div>

                {!isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeSingle(session.id)}
                    disabled={isRevokingThis}
                    className="self-end sm:self-center text-xs text-muted hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20"
                  >
                    {isRevokingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Sign out"
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Re-authentication Dialog for sensitive actions */}
      <Dialog open={reAuthDialogOpen} onOpenChange={setReAuthDialogOpen}>
        <DialogContent className="sm:max-w-md bg-surface text-fg border-border">
          <DialogHeader>
            <div className="flex items-center gap-2 text-warning mb-1">
              <ShieldAlert className="w-5 h-5" />
              <DialogTitle className="text-base font-semibold">
                Confirm Recent Authentication
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs sm:text-sm text-muted">
              Signing out of other devices is a sensitive security action. Please
              re-enter your password to proceed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmPassword} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="reauth-password"
                className="text-xs font-semibold text-muted flex items-center gap-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Password
              </label>
              <Input
                id="reauth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="text-sm bg-bg border-border text-fg"
                autoFocus
                required
              />
            </div>

            <DialogFooter className="mt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReAuthDialogOpen(false);
                  setPassword("");
                }}
                disabled={isSubmittingPassword}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingPassword || !password.trim()}
                className="text-xs"
              >
                {isSubmittingPassword ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Confirm & Sign out"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
