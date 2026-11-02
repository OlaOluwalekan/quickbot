"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { WifiOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
  const t = useTranslations("Errors.offline");
  const [isOffline, setIsOffline] = React.useState(false);
  const [isReconnecting, setIsReconnecting] = React.useState(false);
  const [isDismissed, setIsDismissed] = React.useState(false);

  React.useEffect(() => {
    // Initial check
    if (typeof window !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    const handleOffline = () => {
      setIsOffline(true);
      setIsDismissed(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setIsReconnecting(false);
    };

    const handleFetchError = () => {
      setIsOffline(true);
      setIsDismissed(false);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("app:network-error", handleFetchError);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("app:network-error", handleFetchError);
    };
  }, []);

  const handleRetry = async () => {
    setIsReconnecting(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        setIsOffline(false);
      }
    } catch {
      // Still offline
    } finally {
      setIsReconnecting(false);
    }
  };

  if (!isOffline || isDismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 border-b border-border bg-surface-2/95 px-4 py-2.5 text-xs text-fg shadow-sm backdrop-blur-md transition-all duration-300"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <WifiOff className="h-3.5 w-3.5" />
        </span>
        <span className="truncate font-medium text-fg">
          {isReconnecting ? t("reconnecting") : t("message")}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          onClick={handleRetry}
          disabled={isReconnecting}
          size="sm"
          variant="outline"
          className="h-7 text-2xs px-2.5 rounded-lg inline-flex items-center gap-1.5"
        >
          <RefreshCw
            className={`h-3 w-3 ${isReconnecting ? "animate-spin" : ""}`}
          />
          <span>{t("retryButton")}</span>
        </Button>
        <button
          onClick={() => setIsDismissed(true)}
          aria-label={t("dismiss")}
          className="rounded-md p-1 text-fg-muted hover:text-fg hover:bg-surface transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
