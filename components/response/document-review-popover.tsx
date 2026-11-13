"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Loader2, Wand2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Gated } from "@/components/ui/gated";
import {
  streamDocumentReview,
  type ReviewFindingEvent,
  type ReviewSummaryEvent,
  type ReviewProgressEvent,
} from "@/lib/api/document-review";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import type { SuggestionTarget } from "@/lib/documents/apply-suggestion";

export interface DocumentReviewPopoverProps {
  versionId: string;
  workspaceId: string;
  activeContent: string;
  canAsk?: boolean;
  canEdit?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  className?: string;
  onReviewStarted?: () => void;
}

type ReviewPreset = "errors" | "consistency" | "clarity" | "custom";

export function DocumentReviewPopover({
  versionId,
  workspaceId,
  activeContent,
  canAsk = true,
  canEdit = true,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
  className,
  onReviewStarted,
}: DocumentReviewPopoverProps) {
  const t = useTranslations("Review");
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      controlledOnOpenChange?.(next);
    },
    [controlledOnOpenChange]
  );
  const [preset, setPreset] = React.useState<ReviewPreset>("errors");
  const [customInstruction, setCustomInstruction] = React.useState("");
  const [visibility, setVisibility] = React.useState<"WORKSPACE" | "PRIVATE">("WORKSPACE");
  const [isRunning, setIsRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<ReviewProgressEvent | null>(null);
  const [summary, setSummary] = React.useState<ReviewSummaryEvent | null>(null);
  const [findingsWithFixes, setFindingsWithFixes] = React.useState<ReviewFindingEvent[]>([]);

  const applyFixToDraft = useDocumentDraftsStore((s) => s.applyFixToDraft);
  const drafts = useDocumentDraftsStore((s) => s.drafts);

  // Approximate credits: ~1 credit per 4k chars + base
  const estimatedCredits = React.useMemo(() => {
    const chars = activeContent.length;
    const chunks = Math.max(1, Math.ceil(chars / 20000));
    return Math.max(1, chunks);
  }, [activeContent.length]);

  const handleStartReview = async () => {
    setOpen(false);
    setIsRunning(true);
    setProgress(null);
    setSummary(null);
    setFindingsWithFixes([]);
    onReviewStarted?.();

    const collectedFixes: ReviewFindingEvent[] = [];

    await streamDocumentReview(
      versionId,
      {
        preset,
        instruction: preset === "custom" || customInstruction ? customInstruction : undefined,
        visibility,
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onProgress: (p) => {
          setProgress(p);
        },
        onFinding: (finding) => {
          window.dispatchEvent(
            new CustomEvent("annotations-changed", { detail: { workspaceId } })
          );
          if (finding.suggestion?.replacement) {
            collectedFixes.push(finding);
            setFindingsWithFixes([...collectedFixes]);
          }
        },
        onSummary: (s) => {
          setSummary(s);
          if (s.total === 0) {
            toast.info(t("noFindingsFound"));
          } else {
            toast.success(
              t("summary", {
                total: s.total,
                fixes: collectedFixes.length,
              })
            );
          }
        },
        onDone: () => {
          setIsRunning(false);
          setProgress(null);
        },
        onError: (err) => {
          setIsRunning(false);
          setProgress(null);
          toast.error(err.message || t("reviewFailed"));
        },
      }
    );
  };

  const handleAcceptAllFixes = () => {
    if (!findingsWithFixes.length) return;

    let appliedCount = 0;
    const currentDraft = drafts[versionId];
    let baseContent = currentDraft ? currentDraft.content : activeContent;
    const baseRevision = currentDraft ? currentDraft.baseRevision : null;

    for (const item of findingsWithFixes) {
      if (!item.suggestion?.replacement || !item.suggestion.exact) continue;
      const res = applyFixToDraft({
        versionId,
        baseRevision,
        baseContent,
        suggestionId: item.annotationId,
        suggestion: item.suggestion as SuggestionTarget,
      });

      if (res.ok) {
        appliedCount++;
        baseContent = res.next;
      }
    }

    if (appliedCount > 0) {
      toast.success(t("allFixesApplied", { count: appliedCount }));
      setFindingsWithFixes([]);
      window.dispatchEvent(
        new CustomEvent("annotations-changed", { detail: { workspaceId } })
      );
    } else {
      toast.error(t("noFixesApplicable"));
    }
  };

  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger || (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isRunning}
              className="h-7 gap-1.5 px-2 text-xs text-muted hover:text-foreground"
              data-testid="ask-klecx-review-trigger"
            >
              {isRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-accent" />
              )}
              <span>{isRunning ? t("reviewing") : t("askKlecxReview")}</span>
            </Button>
          )}
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-80 sm:w-96 p-4 space-y-4"
          data-testid="review-popover-content"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h4 className="font-semibold text-sm text-foreground">
                {t("popoverTitle")}
              </h4>
            </div>
            <span className="text-[11px] text-muted">
              {t("estimatedCredits", { credits: estimatedCredits })}
            </span>
          </div>

          {/* Presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t("presetLabel")}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: "errors", labelKey: "presets.errors" },
                  { id: "consistency", labelKey: "presets.consistency" },
                  { id: "clarity", labelKey: "presets.clarity" },
                  { id: "custom", labelKey: "presets.custom" },
                ] as const
              ).map(({ id, labelKey }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`preset-${id}`}
                  onClick={() => setPreset(id)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                    preset === id
                      ? "border-accent bg-accent/10 font-medium text-accent"
                      : "border-border bg-surface text-foreground hover:bg-surface-2"
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {t("instructionLabel")}
            </label>
            <textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder={t("instructionPlaceholder")}
              rows={2}
              className="w-full text-xs rounded-md border border-border bg-surface p-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
              data-testid="review-instruction-input"
            />
          </div>

          {/* Visibility toggle */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
            <span className="text-muted">{t("visibilityLabel")}</span>
            <div className="flex items-center rounded-md border border-border p-0.5 bg-surface">
              <button
                type="button"
                onClick={() => setVisibility("WORKSPACE")}
                data-testid="visibility-workspace-btn"
                className={`rounded px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                  visibility === "WORKSPACE"
                    ? "bg-surface-2 font-medium text-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("visibilityWorkspace")}
              </button>
              <button
                type="button"
                onClick={() => setVisibility("PRIVATE")}
                data-testid="visibility-private-btn"
                className={`rounded px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                  visibility === "PRIVATE"
                    ? "bg-surface-2 font-medium text-foreground shadow-2xs"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {t("visibilityPrivate")}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 px-2.5 text-xs text-muted"
            >
              {t("cancel")}
            </Button>

            <Gated
              reason={
                canAsk
                  ? null
                  : {
                      code: "no_permission",
                      capability: t("capAskReview"),
                    }
              }
            >
              <Button
                type="button"
                size="sm"
                onClick={handleStartReview}
                className="h-7 px-3 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                data-testid="start-review-btn"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t("startReview")}</span>
              </Button>
            </Gated>
          </div>
        </PopoverContent>
      </Popover>

      {/* Running Progress Banner */}
      {isRunning && progress && (
        <div
          data-testid="review-progress-banner"
          className="mt-3 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-foreground animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            <span>
              {progress.message ||
                t("reviewingProgress", {
                  current: progress.section,
                  total: progress.totalSections,
                })}
            </span>
          </div>
        </div>
      )}

      {/* Summary Banner with Accept All Fixes */}
      {!isRunning && summary && summary.total > 0 && findingsWithFixes.length > 0 && (
        <div
          data-testid="review-summary-bar"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground"
        >
          <div className="flex items-center gap-1.5 text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>
              {t("summaryDetails", {
                total: summary.total,
                fixes: findingsWithFixes.length,
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Gated
              reason={
                canEdit
                  ? null
                  : {
                      code: "no_permission",
                      capability: t("capEditResponse"),
                    }
              }
            >
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleAcceptAllFixes}
                data-testid="accept-all-fixes-btn"
                className="h-6 px-2.5 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Wand2 className="h-3 w-3" />
                <span>{t("acceptAll", { count: findingsWithFixes.length })}</span>
              </Button>
            </Gated>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setFindingsWithFixes([])}
              className="h-6 w-6 text-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
