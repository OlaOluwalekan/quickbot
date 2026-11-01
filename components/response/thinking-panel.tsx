"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Brain, Sparkles, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface ThinkingPanelProps {
  stage?: string | null;
  thoughtSummary?: string | null;
  isStreaming?: boolean;
  durationSeconds?: number | null;
  className?: string;
  defaultOpen?: boolean;
}

export function ThinkingPanel({
  stage,
  thoughtSummary,
  isStreaming = false,
  durationSeconds,
  className,
  defaultOpen,
}: ThinkingPanelProps) {
  const t = useTranslations("Response");
  const [isOpen, setIsOpen] = React.useState<boolean>(() => {
    if (defaultOpen !== undefined) return defaultOpen;
    return isStreaming;
  });

  // Automatically open when streaming starts, auto-collapse when completed if not manually kept open
  React.useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  // Stage display label
  const getStageLabel = (s?: string | null) => {
    if (!s) return t("thinking");
    const lower = s.toLowerCase();
    if (lower === "preparing") return t("preparing");
    if (lower === "thinking") return t("thinking");
    if (lower === "writing") return t("writing");
    if (lower === "saving") return t("saving");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const hasThoughts = Boolean(thoughtSummary && thoughtSummary.trim().length > 0);
  const panelId = React.useId();

  // If no thoughts and not currently streaming, don't show
  if (!isStreaming && !hasThoughts) {
    return null;
  }

  // Header pill text when completed
  const summaryLabel = durationSeconds
    ? t("thoughtFor", { seconds: durationSeconds })
    : t("thoughtProcess");

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-2/60 text-xs text-fg-muted overflow-hidden transition-all duration-200",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-2 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <div className="relative flex items-center justify-center h-4 w-4 text-accent">
              <Brain className="h-3.5 w-3.5 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
              </span>
            </div>
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-fg/80" />
          )}

          <span className="font-medium text-fg">
            {isStreaming ? getStageLabel(stage) : summaryLabel}
          </span>

          {isStreaming && stage && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-accent-soft text-accent border border-border font-medium">
              {stage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-fg-muted">
          <span className="text-[11px] sr-only sm:not-sr-only">
            {isOpen ? t("hideThinking") : t("showThinking")}
          </span>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-label={t("thoughtProcess")}
          className="px-3 pb-3 pt-1 border-t border-border/50 bg-surface/30 font-mono text-[11px] leading-relaxed text-fg-muted max-h-60 overflow-y-auto whitespace-pre-wrap select-text"
        >
          {hasThoughts ? (
            thoughtSummary
          ) : isStreaming ? (
            <span className="italic opacity-70 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 animate-spin text-accent" />
              {t("thinking")}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
