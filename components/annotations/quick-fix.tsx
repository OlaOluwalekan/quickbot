"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Gated } from "@/components/ui/gated";
import { api } from "@/lib/api/client";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import {
  applySuggestion,
  toSuggestionTarget,
  type SuggestionTarget,
} from "@/lib/documents/apply-suggestion";
import { cn } from "@/lib/utils";

/** The text a quick fix is applied to. */
export interface QuickFixContext {
  versionId: string;
  responseId?: string | null;
  /** The saved text (latest edit, else the original). */
  savedContent: string;
  /** Revision of the saved text (null = the original). */
  baseRevision: number | null;
  /** Caller holds `workspace.edit_response` (the server re-checks on Save). */
  canEdit: boolean;
}

export interface QuickFixAnnotation {
  id: string;
  authorType?: "USER" | "AI";
  resolvedAt?: string | Date | null;
  suggestion?: unknown;
  suggestionState?: "PENDING" | "ACCEPTED" | "REJECTED" | "STALE" | null;
}

/**
 * - `none`: a comment without a replacement
 * - `pending`: can be accepted
 * - `applied`: in the unsaved draft, waiting for Save
 * - `accepted` / `dismissed`: decided and saved
 * - `stale`: the passage changed, the fix can't be applied any more
 */
export type QuickFixStatus =
  | "none"
  | "pending"
  | "applied"
  | "accepted"
  | "dismissed"
  | "stale";

export function quickFixStatus(
  annotation: QuickFixAnnotation,
  target: SuggestionTarget | null,
  currentText: string | null,
  appliedIds: string[] | undefined
): QuickFixStatus {
  if (!target) return "none";
  if (appliedIds?.includes(annotation.id)) return "applied";
  if (annotation.suggestionState === "ACCEPTED") return "accepted";
  if (annotation.suggestionState === "REJECTED") return "dismissed";
  if (annotation.suggestionState === "STALE") return "stale";
  if (currentText !== null && !applySuggestion(currentText, target).ok) return "stale";
  return "pending";
}

function notifyChanged(responseId?: string | null, annotationId?: string) {
  window.dispatchEvent(
    new CustomEvent("annotation-changed", {
      detail: responseId ? { responseId } : { annotationId },
    })
  );
}

export function useQuickFix(
  annotation: QuickFixAnnotation | null | undefined,
  ctx: QuickFixContext | null | undefined
) {
  const t = useTranslations("Review");
  const draft = useDocumentDraftsStore((s) =>
    ctx ? s.drafts[ctx.versionId] : undefined
  );
  const applyFixToDraft = useDocumentDraftsStore((s) => s.applyFixToDraft);
  const [busy, setBusy] = React.useState(false);

  const target = React.useMemo(
    () => toSuggestionTarget(annotation?.suggestion),
    [annotation?.suggestion]
  );
  const currentText = ctx ? (draft ? draft.content : ctx.savedContent) : null;
  const status: QuickFixStatus = annotation
    ? quickFixStatus(annotation, target, currentText, draft?.appliedSuggestionIds)
    : "none";

  /** Puts the replacement into the draft. Nothing is saved yet. */
  const accept = React.useCallback((): boolean => {
    if (!annotation || !ctx || !target) return false;
    const res = applyFixToDraft({
      versionId: ctx.versionId,
      baseRevision: ctx.baseRevision,
      baseContent: ctx.savedContent,
      suggestionId: annotation.id,
      suggestion: target,
    });
    if (!res.ok) {
      toast.error(t("fixStale"));
      return false;
    }
    toast.success(t("fixApplied"), { description: t("fixAppliedHint") });
    return true;
  }, [annotation, applyFixToDraft, ctx, t, target]);

  /** Closes the finding without changing the text. */
  const dismiss = React.useCallback(async (): Promise<boolean> => {
    if (!annotation) return false;
    setBusy(true);
    try {
      await api(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        json:
          annotation.suggestionState === "PENDING"
            ? { suggestionState: "REJECTED" }
            : { resolved: true },
      });
      toast.success(t("dismissed"));
      notifyChanged(ctx?.responseId, annotation.id);
      return true;
    } catch {
      toast.error(t("dismissFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }, [annotation, ctx, t]);

  return { target, status, accept, dismiss, busy };
}

function clip(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Category and severity of a review finding. */
export function ReviewChips({
  suggestion,
  className,
}: {
  suggestion: unknown;
  className?: string;
}) {
  const t = useTranslations("Review");
  const v = (suggestion ?? {}) as { category?: unknown; severity?: unknown };
  const category = typeof v.category === "string" ? v.category : null;
  const severity = typeof v.severity === "string" ? v.severity : null;
  const knownCategory =
    category &&
    ["spelling", "grammar", "clarity", "consistency", "factual", "structure", "other"].includes(
      category
    );
  const knownSeverity = severity && ["low", "medium", "high"].includes(severity);
  if (!knownCategory && !knownSeverity) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {knownCategory && (
        <span className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground">
          {t(`categories.${category}`)}
        </span>
      )}
      {knownSeverity && (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium",
            severity === "high"
              ? "border-danger/30 bg-danger/10 text-danger"
              : severity === "medium"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-border bg-surface text-muted"
          )}
        >
          {t(`severities.${severity}`)}
        </span>
      )}
    </div>
  );
}

export interface QuickFixBlockProps {
  annotation: QuickFixAnnotation;
  ctx: QuickFixContext | null | undefined;
  /** Called after Accept or Dismiss succeeded (e.g. to close a preview card). */
  onDone?: () => void;
  className?: string;
}

/**
 * What a review finding would change ("JavScript" → "JavaScript") with
 * **Accept** and **Dismiss**. Used by the hover card on the highlight and by
 * the comment's column, so one change can be decided where it is read.
 */
export function QuickFixBlock({ annotation, ctx, onDone, className }: QuickFixBlockProps) {
  const t = useTranslations("Review");
  const { target, status, accept, dismiss, busy } = useQuickFix(annotation, ctx);
  const isOpen = !annotation.resolvedAt;

  if (status === "none") {
    // A remark without a replacement: it can only be dismissed.
    if (!isOpen) return null;
    return (
      <div className={cn("flex items-center justify-end", className)}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          data-testid="dismiss-fix-btn"
          onClick={async () => {
            if (await dismiss()) onDone?.();
          }}
          className="h-7 px-2 text-xs text-muted hover:text-foreground"
        >
          {t("dismiss")}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="quick-fix-block">
      {target && (
        <div
          className="rounded-md border border-border bg-surface-2/60 px-2 py-1.5 text-xs leading-relaxed break-words"
          aria-label={t("changeLabel")}
        >
          <del className="text-danger decoration-danger/60" data-testid="quick-fix-old">
            {clip(target.exact)}
          </del>
          <span aria-hidden="true" className="mx-1.5 text-muted">
            →
          </span>
          <ins className="text-success no-underline font-medium" data-testid="quick-fix-new">
            {target.replacement ? clip(target.replacement) : t("removeText")}
          </ins>
        </div>
      )}

      {status === "applied" && (
        <p
          className="inline-flex items-center gap-1 text-xs text-accent font-medium"
          data-testid="fix-applied-badge"
        >
          <Check className="h-3.5 w-3.5" />
          {t("fixAppliedUnsaved")}
        </p>
      )}
      {status === "accepted" && (
        <p
          className="inline-flex items-center gap-1 text-xs text-accent font-medium"
          data-testid="fix-accepted-badge"
        >
          <Check className="h-3.5 w-3.5" />
          {t("fixAccepted")}
        </p>
      )}
      {status === "dismissed" && (
        <p className="text-xs text-muted" data-testid="fix-dismissed-badge">
          {t("dismissed")}
        </p>
      )}
      {status === "stale" && (
        <p className="text-xs text-muted" data-testid="fix-stale-badge">
          {t("fixStale")}
        </p>
      )}

      {(status === "pending" || (status === "stale" && isOpen)) && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "pending" && ctx && (
            <Gated
              reason={
                ctx.canEdit
                  ? null
                  : { code: "no_permission", capability: t("capEditResponse") }
              }
            >
              <Button
                type="button"
                size="sm"
                data-testid="apply-fix-btn"
                onClick={() => {
                  if (accept()) onDone?.();
                }}
                className="h-7 px-2.5 text-xs gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Wand2 className="h-3 w-3" />
                <span>{t("accept")}</span>
              </Button>
            </Gated>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            data-testid="dismiss-fix-btn"
            onClick={async () => {
              if (await dismiss()) onDone?.();
            }}
            className="h-7 px-2 text-xs text-muted hover:text-foreground"
          >
            {t("dismiss")}
          </Button>
        </div>
      )}
    </div>
  );
}
