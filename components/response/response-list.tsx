"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowDown,
  AlertCircle,
  RotateCcw,
  Sparkles,
  WifiOff,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResponseCard, type ResponseItemData } from "./response-card";
import { ThinkingPanel } from "./thinking-panel";
import {
  useGenerationStore,
  DEFAULT_WORKSPACE_STREAM,
  type WorkspaceGenerationStream,
} from "@/lib/stores/generation";
import type { Actor } from "@/server/auth/session";

export interface ResponseListProps {
  workspaceId: string;
  actor: Actor;
  responses: ResponseItemData[];
  optimisticPrompt?: string | null;
  memberCount?: number;
  onRegenerateTurn?: (responseId: string) => void;
  onRetryFailed?: (prompt: string, idempotencyKey: string) => void;
  onDeleteResponse?: (responseId: string) => void;
  className?: string;
}

export function ResponseList({
  workspaceId,
  actor,
  responses,
  optimisticPrompt,
  memberCount = 1,
  onRegenerateTurn,
  onRetryFailed,
  onDeleteResponse,
  className,
}: ResponseListProps) {
  const t = useTranslations("Response");
  const tChat = useTranslations("Chat");

  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(true);

  // Stream state for current workspace from generation store
  const stream: WorkspaceGenerationStream = useGenerationStore(
    (s) => s.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM
  );

  const isStreaming = stream.status === "streaming";
  const isFailed = stream.status === "failed";
  const isCompleted = stream.status === "completed";
  const currentPrompt = optimisticPrompt || (!isCompleted && stream.prompt ? stream.prompt : null);
  const showActiveTurn = Boolean(currentPrompt || isStreaming || isFailed);

  // Track online status
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Scroll position monitor (120px threshold)
  const handleScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Show jump pill if scrolled up > 120px from bottom
    setShowJumpToLatest(distanceFromBottom > 120);
  }, []);

  // Jump to latest handler
  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Auto-scroll on stream tokens or new responses ONLY if within 120px threshold
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= 120) {
      scrollToBottom("smooth");
    }
  }, [responses.length, stream.text, stream.thought, isStreaming, scrollToBottom]);

  // Handle retry with fresh idempotency key
  const handleRetry = () => {
    if (!onRetryFailed || !currentPrompt) return;
    const freshIdemKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "retry-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    onRetryFailed(currentPrompt, freshIdemKey);
  };

  // Detect 402 / insufficient credits error
  const isCreditsError = Boolean(
    stream.error &&
      (stream.error === "402" ||
        stream.error.toLowerCase().includes("credit") ||
        stream.error === "insufficient_credits")
  );

  return (
    <div className={cn("relative flex-1 flex flex-col h-full w-full overflow-hidden", className)}>
      {/* Offline Banner */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-danger/10 border-b border-danger/20 px-4 py-2 text-xs font-medium text-danger flex items-center justify-center gap-2 select-none"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{t("offline")}</span>
        </div>
      )}

      {/* Scrollable Timeline */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-6 space-y-6 scroll-smooth"
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Historical Responses */}
          {responses.map((res, idx) => (
            <ResponseCard
              key={res.id}
              response={res}
              workspaceId={workspaceId}
              userId={actor.userId}
              memberCount={memberCount}
              onRegenerate={onRegenerateTurn}
              onDelete={onDeleteResponse}
              isFirstPrompt={idx === 0 && !optimisticPrompt}
              className={cn(idx === 0 && !optimisticPrompt && "vt-first-prompt")}
            />
          ))}

          {/* Active Generation Turn (Optimistic Prompt + Thinking + Streaming Bubble) */}
          {showActiveTurn && (
            <div className="space-y-4 pt-2">
              {/* Optimistic Prompt Bubble */}
              {currentPrompt && (
                <div className="flex justify-end">
                  <div
                    className={cn(
                      "max-w-2xl rounded-2xl bg-surface-2 border border-border px-4 py-2.5 text-sm sm:text-base text-fg shadow-2xs whitespace-pre-wrap leading-relaxed select-text",
                      responses.length === 0 && "vt-first-prompt"
                    )}
                  >
                    {currentPrompt}
                  </div>
                </div>
              )}

              {/* Streaming Output / Thinking Panel */}
              {(isStreaming || stream.text || stream.thought) && (
                <div className="flex gap-3 text-left animate-fade-in">
                  <div className="h-8 w-8 rounded-xl bg-accent text-accent-fg flex items-center justify-center shrink-0 shadow-2xs">
                    <Sparkles className="h-4 w-4 animate-spin-slow" />
                  </div>

                  <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 text-sm sm:text-base text-fg shadow-2xs space-y-3.5">
                    {/* Live Thinking Panel */}
                    <ThinkingPanel
                      stage={stream.progressLabel}
                      thoughtSummary={stream.thought}
                      isStreaming={isStreaming}
                      defaultOpen={true}
                    />

                    {/* Stream Output Text with Soft Caret */}
                    {stream.text ? (
                      <div className="leading-relaxed select-text overflow-x-auto whitespace-pre-wrap break-words">
                        {stream.text}
                        {isStreaming && (
                          <span
                            aria-hidden="true"
                            className="inline-block w-2 h-4 ml-0.5 bg-accent rounded-2xs align-middle animate-pulse"
                          />
                        )}
                      </div>
                    ) : isStreaming ? (
                      <div className="flex items-center gap-2 text-fg-muted italic text-xs sm:text-sm py-1">
                        <span
                          aria-hidden="true"
                          className="inline-block w-2 h-4 bg-accent/70 rounded-2xs animate-pulse"
                        />
                        <span>{t("thinking")}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Insufficient Credits State (402) */}
              {isCreditsError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:p-5 text-fg space-y-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2 text-warning font-semibold text-sm">
                    <CreditCard className="h-4 w-4" />
                    <span>{t("outOfCredits")}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-fg-muted">
                    {tChat("outOfCreditsReason")}
                  </p>
                  <div className="pt-1">
                    <Button size="sm" asChild className="bg-accent text-accent-fg hover:bg-accent/90 text-xs">
                      <Link href="/settings">
                        {t("upgradePlan")}
                      </Link>
                    </Button>
                  </div>
                </div>
              )}

              {/* Failed Generation State (with Localized Error & Try Again) */}
              {isFailed && !isCreditsError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-danger/30 bg-danger/5 p-4 sm:p-5 text-fg space-y-3 shadow-2xs"
                >
                  <div className="flex items-center gap-2 text-danger font-semibold text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>{tChat("streamError")}</span>
                  </div>
                  {stream.error && (
                    <p className="text-xs text-danger/80 font-mono bg-danger/10 px-2.5 py-1.5 rounded-lg">
                      {stream.error}
                    </p>
                  )}
                  {onRetryFailed && currentPrompt && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleRetry}
                        className="text-xs border-danger/40 text-danger hover:bg-danger/10"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        <span>{t("tryAgain")}</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div ref={bottomSentinelRef} className="h-2 w-full" />
        </div>
      </div>

      {/* Floating "Jump to latest" Pill */}
      {showJumpToLatest && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 animate-fade-in">
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-2/95 text-fg text-xs font-medium border border-border shadow-md hover:bg-surface transition-all duration-150 backdrop-blur-xs cursor-pointer select-none"
          >
            <ArrowDown className="h-3.5 w-3.5 text-accent animate-bounce" />
            <span>{t("jumpToLatest")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
