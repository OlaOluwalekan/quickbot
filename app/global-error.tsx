"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, LifeBuoy } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[Global Error]", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  const reportUrl = error.digest
    ? `/support?digest=${encodeURIComponent(error.digest)}`
    : "/support";

  return (
    <html lang="en">
      <body className="min-h-screen w-full flex items-center justify-center bg-bg text-fg font-sans antialiased p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-surface/95 p-8 sm:p-10 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <AlertTriangle className="h-6 w-6" />
          </div>

          <h1 className="text-xl font-bold text-fg">Critical System Error</h1>
          <p className="mt-2 text-sm text-fg-muted">
            An unexpected error interrupted the application. Your data is safe.
          </p>

          {error.digest && (
            <div className="mt-4 rounded-lg border border-border/70 bg-surface-2/60 px-3 py-2 text-xs">
              <span className="text-fg-muted">Error Reference: </span>
              <code className="font-mono font-bold text-fg">
                {error.digest}
              </code>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => reset()}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-fg hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Try again</span>
            </button>

            <a
              href={reportUrl}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors"
            >
              <LifeBuoy className="h-3.5 w-3.5 text-accent" />
              <span>Contact Support</span>
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
