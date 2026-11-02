"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, RefreshCw, LifeBuoy, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  React.useEffect(() => {
    // Log sanitized error with digest without leaking stack to user UI
    console.error("[App Error]", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  const reportUrl = error.digest
    ? `/support?digest=${encodeURIComponent(error.digest)}`
    : "/support";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg text-fg px-4 py-8">
      <div className="w-full max-w-xl">
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6 text-accent" />}
          title={t("generalError.title")}
          description={t("generalError.description")}
          className="border-border/80 bg-surface/90 shadow-sm p-8 sm:p-10"
          action={
            <div className="w-full flex flex-col items-center gap-5 mt-2">
              {error.digest && (
                <div className="w-full max-w-md rounded-lg border border-border/70 bg-surface-2/60 px-3 py-2 text-center">
                  <span className="text-xs text-fg-muted font-medium">
                    {t("generalError.digestLabel")}{" "}
                  </span>
                  <code className="text-xs font-mono font-bold text-fg">
                    {error.digest}
                  </code>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={() => reset()}
                  size="sm"
                  className="inline-flex items-center gap-2 rounded-xl"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{t("generalError.retryButton")}</span>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="inline-flex items-center gap-2 rounded-xl"
                >
                  <Link href={reportUrl}>
                    <LifeBuoy className="h-3.5 w-3.5 text-accent" />
                    <span>{t("generalError.reportButton")}</span>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="inline-flex items-center gap-2 rounded-xl text-fg-muted"
                >
                  <Link href="/">
                    <Home className="h-3.5 w-3.5" />
                    <span>{t("generalError.homeButton")}</span>
                  </Link>
                </Button>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
