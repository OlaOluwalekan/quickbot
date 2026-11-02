"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertCircle, RefreshCw, Layers, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Errors");

  React.useEffect(() => {
    console.error("[Workspace Error]", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  const reportUrl = error.digest
    ? `/support?digest=${encodeURIComponent(error.digest)}`
    : "/support";

  return (
    <div className="flex-1 w-full h-full min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={<AlertCircle className="h-6 w-6 text-accent" />}
          title={t("appError.title")}
          description={t("appError.description")}
          className="border-border/80 bg-surface/80 p-8 sm:p-10 shadow-xs"
          action={
            <div className="w-full flex flex-col items-center gap-4 mt-2">
              {error.digest && (
                <div className="w-full rounded-lg border border-border/70 bg-surface-2/60 px-3 py-1.5 text-xs text-center">
                  <span className="text-fg-muted">
                    {t("generalError.digestLabel")}{" "}
                  </span>
                  <code className="font-mono font-bold text-fg">
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
                  <span>{t("appError.retryButton")}</span>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="inline-flex items-center gap-2 rounded-xl"
                >
                  <Link href="/workspaces">
                    <Layers className="h-3.5 w-3.5 text-accent" />
                    <span>{t("appError.workspacesButton")}</span>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="inline-flex items-center gap-2 rounded-xl text-fg-muted"
                >
                  <Link href={reportUrl}>
                    <LifeBuoy className="h-3.5 w-3.5" />
                    <span>{t("appError.reportButton")}</span>
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
