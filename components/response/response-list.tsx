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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResponseCard, type ResponseItemData } from "./response-card";
import { DocumentCard } from "./document-card";
import { ThinkingPanel } from "./thinking-panel";
import { SourcesAccordion } from "./citations";
import { Markdown } from "@/components/markdown";
import { SelectionToolbar } from "@/components/annotations";
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
  /**
   * Caller's workspace capabilities, for gating the annotation toolbar.
   * When unknown the buttons stay enabled; the server checks either way.
   */
  capabilities?: string[];
  /** Called after an Ask was added to the question queue. */
  onQuestionQueued?: () => void;
  /**
   * Render the selection toolbar here (default). The workspace page renders
   * one toolbar for all columns instead, because this list is hidden while
   * the main conversation is collapsed to a spine.
   */
  withSelectionToolbar?: boolean;
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
  capabilities,
  onQuestionQueued,
  withSelectionToolbar = true,
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
  const userScrolledUpRef = React.useRef(false);

  // Stream state for current workspace from generation store
  const stream: WorkspaceGenerationStream = useGenerationStore(
    (s) => s.streams[workspaceId] ?? DEFAULT_WORKSPACE_STREAM
  );

  const isStreaming = stream.status === "streaming";
  const isFailed = stream.status === "failed";
  const isCompleted = stream.status === "completed";
  const currentPrompt =
    optimisticPrompt || (!isCompleted && stream.prompt ? stream.prompt : null);
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

  // Reset user-scrolled state when a new generation begins or prompt is submitted
  React.useEffect(() => {
    if (isStreaming || optimisticPrompt) {
      userScrolledUpRef.current = false;
      setShowJumpToLatest(false);
    }
  }, [isStreaming, optimisticPrompt]);

  // Scroll position monitor: tracks if user explicitly scrolled away from bottom
  const handleScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user scrolled up by more than 80px from bottom, respect their scroll position
    const isScrolledUp = distanceFromBottom > 80;
    userScrolledUpRef.current = isScrolledUp;
    setShowJumpToLatest(isScrolledUp);
  }, []);

  // Jump to latest handler
  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
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
    },
    []
  );

  const handleJumpToLatest = React.useCallback(() => {
    userScrolledUpRef.current = false;
    setShowJumpToLatest(false);
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  // Auto-scroll on stream chunks or new responses to the latest available chunk,
  // except when the user has scrolled up, in which case it remains at the user's position.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If user deliberately scrolled away, keep their scroll position
    if (userScrolledUpRef.current) return;

    // Auto-scroll directly to bottom
    el.scrollTop = el.scrollHeight;
  }, [
    responses.length,
    stream.text,
    stream.thought,
    isStreaming,
  ]);

  // Handle retry with fresh idempotency key
  const handleRetry = () => {
    if (!onRetryFailed || !currentPrompt) return;
    const freshIdemKey =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "retry-" +
          Date.now().toString(36) +
          Math.random().toString(36).substring(2, 8);
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
    <div
      className={cn(
        "relative flex h-full w-full flex-1 flex-col overflow-hidden",
        className
      )}
    >
      {/* Offline Banner */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-danger/10 border-danger/20 text-danger flex items-center justify-center gap-2 border-b px-4 py-2 text-xs font-medium select-none"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{t("offline")}</span>
        </div>
      )}

      {/* Scrollable Timeline */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 space-y-6 overflow-y-auto px-3 py-6 sm:px-6"
      >
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Historical Responses */}
          {responses.map((res, idx) =>
            res.kind === "DOCUMENT" ? (
              <DocumentCard
                key={res.id}
                response={res}
                workspaceId={workspaceId}
                userId={actor.userId}
                canEdit={
                  capabilities
                    ? capabilities.includes("workspace.edit_response")
                    : undefined
                }
                onDelete={onDeleteResponse}
                className={cn(
                  idx === 0 && !optimisticPrompt && "vt-first-prompt"
                )}
              />
            ) : (
              <ResponseCard
                key={res.id}
                response={res}
                workspaceId={workspaceId}
                userId={actor.userId}
                memberCount={memberCount}
                onRegenerate={onRegenerateTurn}
                onDelete={onDeleteResponse}
                isFirstPrompt={idx === 0 && !optimisticPrompt}
                className={cn(
                  idx === 0 && !optimisticPrompt && "vt-first-prompt"
                )}
              />
            )
          )}

          {/* Active Generation Turn (Optimistic Prompt + Thinking + Streaming Bubble) */}
          {showActiveTurn && (
            <div className="space-y-4 pt-2">
              {/* Optimistic Prompt Bubble */}
              {currentPrompt && (
                <div className="flex justify-end">
                  <div
                    className={cn(
                      "bg-surface-2 border-border text-fg max-w-2xl rounded-2xl border px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-2xs select-text sm:text-base",
                      responses.length === 0 && "vt-first-prompt"
                    )}
                  >
                    {currentPrompt}
                  </div>
                </div>
              )}

              {/* Streaming Output / Thinking Panel */}
              {(isStreaming || stream.text || stream.thought) && (
                <div className="animate-fade-in flex gap-3 text-left">
                  <div className="bg-accent text-accent-fg flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-2xs">
                    <Sparkles className="animate-spin-slow h-4 w-4" />
                  </div>

                  <div className="border-border bg-surface text-fg min-w-0 flex-1 space-y-3.5 rounded-2xl border p-4 text-sm shadow-2xs sm:p-5 sm:text-base">
                    {/* Live Thinking Panel */}
                    <ThinkingPanel
                      stage={stream.progressLabel}
                      thoughtSummary={stream.thought}
                      isStreaming={isStreaming}
                      defaultOpen={true}
                    />

                    {/* Stream Output Text with Soft Caret or Image Generation Skeleton */}
                    {stream.kind === "IMAGE" && isStreaming ? (
                      <div
                        data-testid="image-generation-skeleton"
                        className="bg-surface-2 border-border flex aspect-square w-full max-w-md animate-pulse flex-col items-center justify-center gap-2 rounded-2xl border"
                      >
                        <Sparkles className="text-accent h-6 w-6 animate-spin" />
                        <span className="text-fg-muted text-xs">
                          {stream.progressLabel || t("thinking")}
                        </span>
                      </div>
                    ) : stream.text ? (
                      <div className="overflow-x-auto leading-relaxed wrap-break-word select-text">
                        <Markdown
                          content={stream.text}
                          isStreaming={isStreaming}
                          citations={stream.citations}
                        />
                        {isStreaming && (
                          <span
                            aria-hidden="true"
                            className="bg-accent rounded-2xs ml-0.5 inline-block h-4 w-2 animate-pulse align-middle"
                          />
                        )}
                      </div>
                    ) : isStreaming ? (
                      <div className="text-fg-muted flex items-center gap-2 py-1 text-xs italic sm:text-sm">
                        <span
                          aria-hidden="true"
                          className="bg-accent/70 rounded-2xs inline-block h-4 w-2 animate-pulse"
                        />
                        <span>{t("thinking")}</span>
                      </div>
                    ) : null}

                    {stream.citations && stream.citations.length > 0 && (
                      <SourcesAccordion
                        citations={stream.citations}
                        label={t("sources")}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Insufficient Credits State (402) */}
              {isCreditsError && (
                <div
                  role="alert"
                  className="border-warning/30 bg-warning/10 text-fg space-y-3 rounded-2xl border p-4 shadow-2xs sm:p-5"
                >
                  <div className="text-warning flex items-center gap-2 text-sm font-semibold">
                    <CreditCard className="h-4 w-4" />
                    <span>{t("outOfCredits")}</span>
                  </div>
                  <p className="text-fg-muted text-xs sm:text-sm">
                    {tChat("outOfCreditsReason")}
                  </p>
                  <div className="pt-1">
                    <Button
                      size="sm"
                      asChild
                      className="bg-accent text-accent-fg hover:bg-accent/90 text-xs"
                    >
                      <Link href="/settings">{t("upgradePlan")}</Link>
                    </Button>
                  </div>
                </div>
              )}

              {/* Failed Generation State (with Localized Error & Try Again) */}
              {isFailed && !isCreditsError && (
                <div
                  role="alert"
                  className="border-danger/30 bg-danger/5 text-fg space-y-3 rounded-2xl border p-4 shadow-2xs sm:p-5"
                >
                  <div className="text-danger flex items-center gap-2 text-sm font-semibold">
                    <AlertCircle className="h-4 w-4" />
                    <span>{tChat("streamError")}</span>
                  </div>
                  {stream.error && (
                    <p className="text-danger/80 bg-danger/10 rounded-lg px-2.5 py-1.5 font-mono text-xs">
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
                        className="border-danger/40 text-danger hover:bg-danger/10 text-xs"
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
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

      {/* Step 6.3 Annotation Selection Toolbar */}
      {withSelectionToolbar && (
        <SelectionToolbar
          workspaceId={workspaceId}
          canComment={capabilities ? capabilities.includes("workspace.comment") : undefined}
          canAsk={capabilities ? capabilities.includes("workspace.ask") : undefined}
          onQuestionCreated={onQuestionQueued}
        />
      )}

      {/* Floating "Jump to latest" Pill */}
      {showJumpToLatest && (
        <div className="animate-fade-in absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            onClick={handleJumpToLatest}
            className="bg-surface-2/95 text-fg border-border hover:bg-surface flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-md backdrop-blur-xs transition-all duration-150 select-none"
          >
            <ArrowDown className="text-accent h-3.5 w-3.5 animate-bounce" />
            <span>{t("jumpToLatest")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
