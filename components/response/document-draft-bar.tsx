"use client";

import * as React from "react";
import { diffWords } from "diff";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Loader2,
  RotateCcw,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api/client";
import { useCreateVersionEdit } from "@/lib/api/hooks/responses";
import {
  useDocumentDraftsStore,
  type DocumentDraft,
} from "@/lib/stores/document-drafts";
import { reapplyChanges } from "@/lib/documents/reapply-changes";
import { MAX_EDIT_CHARS } from "@/lib/schemas/response";
import { cn } from "@/lib/utils";

export interface DocumentDraftBarProps {
  versionId: string;
  workspaceId: string;
  userId: string;
  savedContent: string;
  draft: DocumentDraft;
  onSaved?: (newContent: string, newRevision: number) => void;
  onDiscarded?: () => void;
  className?: string;
}

interface ConflictState {
  latestRevision: number | null;
  latestContent: string;
}

export function DocumentDraftBar({
  versionId,
  workspaceId,
  userId,
  savedContent,
  draft,
  onSaved,
  onDiscarded,
  className,
}: DocumentDraftBarProps) {
  const t = useTranslations("Documents");
  const [showDiff, setShowDiff] = React.useState(false);
  const [conflict, setConflict] = React.useState<ConflictState | null>(null);

  const setDraft = useDocumentDraftsStore((s) => s.setDraft);
  const discardDraft = useDocumentDraftsStore((s) => s.discardDraft);
  const clearDraft = useDocumentDraftsStore((s) => s.clearDraft);

  const saveMutation = useCreateVersionEdit(userId, workspaceId);
  const tooLong = draft.content.length > MAX_EDIT_CHARS;

  const diffParts = React.useMemo(() => {
    if (!showDiff) return [];
    const baseText = conflict ? conflict.latestContent : savedContent;
    return diffWords(baseText, draft.content);
  }, [showDiff, conflict, savedContent, draft.content]);

  const executeSave = React.useCallback(
    async (baseRevisionOverride?: number | null) => {
      const effectiveBaseRevision =
        baseRevisionOverride !== undefined
          ? baseRevisionOverride
          : draft.baseRevision;

      try {
        const result = await saveMutation.mutateAsync({
          versionId,
          input: {
            content: draft.content,
            baseRevision: effectiveBaseRevision,
            acceptedSuggestionIds:
              draft.appliedSuggestionIds.length > 0
                ? draft.appliedSuggestionIds
                : undefined,
          },
        });
        clearDraft(versionId);
        setConflict(null);
        toast.success(t("saved"));
        onSaved?.(result.content, result.revision);
      } catch (err) {
        if (
          err instanceof ApiClientError &&
          err.status === 409 &&
          err.code === "edit_conflict"
        ) {
          const details = (err.details ?? {}) as {
            latestRevision?: number | null;
            latestContent?: string;
          };
          setConflict({
            latestRevision: details.latestRevision ?? null,
            latestContent: details.latestContent ?? savedContent,
          });
          return;
        }
        toast.error(t("errors.saveFailed"));
      }
    },
    [
      clearDraft,
      draft.appliedSuggestionIds,
      draft.baseRevision,
      draft.content,
      onSaved,
      saveMutation,
      savedContent,
      t,
      versionId,
    ]
  );

  // Rebuilds the draft on top of the newer saved text. Everything in the
  // draft (quick fixes and manual edits) is carried over; when a change can't
  // be placed the draft is left as it is, so nothing is lost.
  const handleReloadAndReapply = React.useCallback(() => {
    if (!conflict) return;
    const merged = reapplyChanges(
      draft.baseContent ?? savedContent,
      draft.content,
      conflict.latestContent
    );

    if (merged === null) {
      toast.error(t("errors.reapplyFailed"));
      return;
    }

    if (merged === conflict.latestContent) {
      // The newer revision already holds every change of this draft.
      clearDraft(versionId);
    } else {
      setDraft(versionId, {
        ...draft,
        baseRevision: conflict.latestRevision,
        baseContent: conflict.latestContent,
        content: merged,
      });
    }
    setConflict(null);
  }, [clearDraft, conflict, draft, savedContent, setDraft, t, versionId]);

  const handleDiscard = React.useCallback(() => {
    discardDraft(versionId);
    setConflict(null);
    toast.success(t("discarded"));
    onDiscarded?.();
  }, [discardDraft, onDiscarded, t, versionId]);

  return (
    <div
      data-testid="document-draft-bar"
      className={cn(
        "sticky bottom-2 z-10 mt-4 rounded-xl border border-info/40 bg-surface/95 backdrop-blur-sm shadow-md p-3 space-y-2.5",
        className
      )}
    >
      {conflict && (
        <div
          data-testid="document-conflict-banner"
          className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs space-y-2"
        >
          <div className="flex items-start gap-2 text-fg">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t("conflictTitle")}</p>
              <p className="text-muted">{t("conflictMessage")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReloadAndReapply}
              data-testid="conflict-reload-btn"
              className="h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              {t("reloadAndReapply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void executeSave(conflict.latestRevision)}
              disabled={saveMutation.isPending || tooLong}
              data-testid="conflict-overwrite-btn"
              className="h-7 text-xs"
            >
              {t("overwrite")}
            </Button>
          </div>
        </div>
      )}

      {showDiff && (
        <div
          data-testid="document-diff-panel"
          className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface-2/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
        >
          {diffParts.map((part, idx) => (
            <span
              key={idx}
              className={cn(
                part.added && "bg-success/15 text-success font-medium",
                part.removed && "bg-danger/15 text-danger line-through"
              )}
            >
              {part.value}
            </span>
          ))}
        </div>
      )}

      {tooLong && (
        <p role="alert" className="text-xs text-danger" data-testid="draft-too-long">
          {t("errors.tooLong", { max: MAX_EDIT_CHARS })}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-fg">
          <span className="inline-block h-2 w-2 rounded-full bg-info" />
          <span data-testid="draft-unsaved-count">
            {t("unsavedChanges", { count: draft.changeCount })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowDiff((prev) => !prev)}
            data-testid="draft-view-changes-btn"
            className="h-7 gap-1 px-2 text-xs text-muted hover:text-fg"
          >
            {showDiff ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>{t("hideChanges")}</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>{t("viewChanges")}</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={saveMutation.isPending}
            data-testid="draft-discard-btn"
            className="h-7 gap-1 px-2 text-xs text-muted hover:text-danger"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t("discard")}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => void executeSave()}
            disabled={saveMutation.isPending || tooLong}
            data-testid="draft-save-btn"
            className="h-7 gap-1 px-3 text-xs bg-accent text-accent-fg hover:bg-accent/90"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>{saveMutation.isPending ? t("saving") : t("save")}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
