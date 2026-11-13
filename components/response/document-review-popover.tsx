"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Gated } from "@/components/ui/gated";
import { api } from "@/lib/api/client";
import { streamDocumentReview } from "@/lib/api/document-review";
import { useDocumentReviewStore } from "@/lib/stores/document-review";
import { REVIEW_PRESETS } from "@/lib/schemas/document-review";
import { cn } from "@/lib/utils";

type ReviewPreset = (typeof REVIEW_PRESETS)[number];

export interface DocumentReviewProps {
  /** The response version reviewed; unused when `documentId` is set. */
  versionId: string;
  /** A generated document (F3.4): its current revision is reviewed. */
  documentId?: string;
  responseId: string;
  /** Caller holds `workspace.ask` (the server re-checks). */
  canAsk?: boolean;
  /** The text has unsaved changes: a review reads the saved text. */
  hasDraft?: boolean;
  /** Other people can open the workspace: findings are shared by default. */
  hasMembers?: boolean;
  /**
   * "popover" renders its own button (document card). "dialog" has no button
   * and is opened by the parent (the ⋯ menu of a response).
   */
  mode?: "popover" | "dialog";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** Tells the highlights of this response to reload. */
function notifyAnnotationsChanged(responseId: string) {
  window.dispatchEvent(
    new CustomEvent("annotation-changed", { detail: { responseId } })
  );
}

/**
 * "Ask Klecx to review" (F3.3): choose what to look for, then Klecx leaves
 * comments on exact passages. The findings are annotations: they appear as
 * wavy underlines while the review runs and stay after a reload.
 */
export function DocumentReview({
  versionId: versionIdProp,
  documentId,
  responseId,
  canAsk = true,
  hasDraft = false,
  hasMembers = false,
  mode = "popover",
  open: controlledOpen,
  onOpenChange,
  className,
}: DocumentReviewProps) {
  const t = useTranslations("Review");
  // Runs are tracked per reviewed text: a version, or a generated document.
  const versionId = documentId ?? versionIdProp;
  const endpoint = documentId
    ? `/api/v1/documents/${encodeURIComponent(documentId)}/review`
    : `/api/v1/response-versions/${encodeURIComponent(versionId)}/review`;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const [preset, setPreset] = React.useState<ReviewPreset>("errors");
  const [instruction, setInstruction] = React.useState("");
  const [visibility, setVisibility] = React.useState<"WORKSPACE" | "PRIVATE">(
    hasMembers ? "WORKSPACE" : "PRIVATE"
  );
  const [estimate, setEstimate] = React.useState<number | null>(null);

  const isRunning = useDocumentReviewStore((s) => Boolean(s.runs[versionId]));

  // The amount the server will reserve, asked when the form opens.
  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api<{ estimatedCredits: number }>(endpoint)
      .then((res) => {
        if (!cancelled) setEstimate(res.estimatedCredits);
      })
      .catch(() => {
        // No estimate shown; starting the review still works.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, endpoint]);

  const needsInstruction = preset === "custom" && !instruction.trim();

  const handleStart = async () => {
    if (isRunning || needsInstruction) return;
    setOpen(false);

    const store = useDocumentReviewStore.getState();
    store.start(versionId);

    // Marks appear while the review runs; one reload per burst of findings.
    let found = 0;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        notifyAnnotationsChanged(responseId);
      }, 400);
    };
    const finish = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      useDocumentReviewStore.getState().finish(versionId);
      notifyAnnotationsChanged(responseId);
    };

    await streamDocumentReview(
      documentId ? { documentId } : versionId,
      {
        preset,
        instruction: instruction.trim() || undefined,
        visibility,
        idempotencyKey: `review_${versionId}_${crypto.randomUUID()}`,
      },
      {
        onProgress: (p) =>
          useDocumentReviewStore.getState().update(versionId, {
            section: p.section,
            totalSections: p.totalSections,
          }),
        onFinding: () => {
          found++;
          useDocumentReviewStore.getState().update(versionId, { found });
          scheduleReload();
        },
        onSummary: (s) => {
          finish();
          if (s.total === 0) {
            toast.info(s.incomplete ? t("incompleteNothing") : t("noFindingsFound"));
            return;
          }
          toast.success(t("summary", { total: s.total, fixes: s.fixes }), {
            description: s.incomplete ? t("incomplete") : t("summaryHint"),
          });
        },
        onError: (err) => {
          finish();
          if (err.code === "duplicate_request") return;
          const message =
            err.code === "insufficient_credits"
              ? t("errors.credits")
              : err.code === "forbidden"
                ? t("errors.forbidden")
                : err.code === "rate_limited" || err.code === "http_429"
                  ? t("errors.rateLimited")
                  : err.code === "empty_document"
                    ? t("errors.empty")
                    : t("reviewFailed");
          toast.error(
            message,
            err.total ? { description: t("errors.partial", { count: err.total }) } : undefined
          );
        },
      }
    );
  };

  const form = (
    <div className="space-y-4" data-testid="review-form">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground">{t("presetLabel")}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {REVIEW_PRESETS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={preset === id}
              data-testid={`preset-${id}`}
              onClick={() => setPreset(id)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer",
                preset === id
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-border bg-surface text-foreground hover:bg-surface-2"
              )}
            >
              {t(`presets.${id}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label
          htmlFor={`review-instruction-${versionId}`}
          className="text-xs font-medium text-foreground"
        >
          {preset === "custom" ? t("instructionLabelRequired") : t("instructionLabel")}
        </label>
        <textarea
          id={`review-instruction-${versionId}`}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={t("instructionPlaceholder")}
          rows={2}
          maxLength={2000}
          className="w-full text-xs rounded-md border border-border bg-surface p-2 text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
          data-testid="review-instruction-input"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-border/40">
        <span className="text-muted" id={`review-visibility-${versionId}`}>
          {t("visibilityLabel")}
        </span>
        <div
          role="group"
          aria-labelledby={`review-visibility-${versionId}`}
          className="flex items-center rounded-md border border-border p-0.5 bg-surface"
        >
          {(["WORKSPACE", "PRIVATE"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={visibility === v}
              onClick={() => setVisibility(v)}
              data-testid={`visibility-${v.toLowerCase()}-btn`}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] transition-colors cursor-pointer",
                visibility === v
                  ? "bg-surface-2 font-medium text-foreground shadow-2xs"
                  : "text-muted hover:text-foreground"
              )}
            >
              {v === "WORKSPACE" ? t("visibilityWorkspace") : t("visibilityPrivate")}
            </button>
          ))}
        </div>
      </div>

      {hasDraft && (
        <p className="text-[11px] text-muted" data-testid="review-draft-note">
          {t("draftNote")}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
        <span className="text-[11px] text-muted" data-testid="review-estimate">
          {estimate !== null && estimate > 0
            ? t("estimatedCredits", { credits: estimate })
            : ""}
        </span>
        <div className="flex items-center gap-2">
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
              canAsk ? null : { code: "no_permission", capability: t("capAskReview") }
            }
          >
            <Button
              type="button"
              size="sm"
              onClick={handleStart}
              disabled={isRunning || needsInstruction}
              className="h-7 px-3 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
              data-testid="start-review-btn"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("startReview")}</span>
            </Button>
          </Gated>
        </div>
      </div>
    </div>
  );

  if (mode === "dialog") {
    return (
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="review-dialog-content">
          <DialogHeader>
            <DialogTitle>{t("popoverTitle")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className={className}>
      <Popover open={isOpen} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 sm:w-96 p-4 space-y-3"
          data-testid="review-popover-content"
        >
          <div className="space-y-1 border-b border-border/60 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h4 className="font-semibold text-sm text-foreground">{t("popoverTitle")}</h4>
            </div>
            <p className="text-[11px] text-muted">{t("description")}</p>
          </div>
          {form}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** "Reviewing section 2 of 5…", shown on the card while a review runs. */
export function DocumentReviewProgress({
  versionId,
  className,
}: {
  versionId: string;
  className?: string;
}) {
  const t = useTranslations("Review");
  const run = useDocumentReviewStore((s) => s.runs[versionId]);
  if (!run) return null;
  return (
    <div
      role="status"
      data-testid="review-progress-banner"
      className={cn(
        "flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-foreground",
        className
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent shrink-0" />
      <span>
        {run.totalSections > 1
          ? t("reviewingProgress", { current: run.section, total: run.totalSections })
          : t("reviewing")}
        {run.found > 0 && ` · ${t("foundSoFar", { count: run.found })}`}
      </span>
    </div>
  );
}
