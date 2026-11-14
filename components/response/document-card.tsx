"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  FileText,
  FileSpreadsheet,
  FileType,
  Download,
  Copy,
  Check,
  Edit2,
  Share2,
  Wand2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnswerBody } from "./answer-body";
import { EditResponse } from "./edit-response";
import { DocumentDraftBar } from "./document-draft-bar";
import { ShareAndPeopleDialog } from "@/components/workspace/ShareAndPeopleDialog";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import { Gated } from "@/components/ui/gated";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/api/hooks/workspaces";
import { exportFormatGateReason } from "@/lib/entitlements/shared";
import {
  applySuggestion,
  toSuggestionTarget,
} from "@/lib/documents/apply-suggestion";
import type { AnnotationItem } from "@/components/annotations/types";
import { DocumentReview, DocumentReviewProgress } from "./document-review-popover";
import type { ResponseItemData } from "./response-card";

export interface DocumentCardProps {
  response: ResponseItemData;
  workspaceId: string;
  userId: string;
  /** False when the member may not edit (viewer, suspended). The server re-checks. */
  canEdit?: boolean;
  /** False when the member may not ask Klecx (no `workspace.ask`). The server re-checks. */
  canAsk?: boolean;
  /** False when the member may not export (no `workspace.export`). The server re-checks. */
  canExport?: boolean;
  /** People who can open the workspace: review comments are shared by default when > 1. */
  memberCount?: number;
  onDelete?: (responseId: string) => void;
  className?: string;
}

const COLLAPSE_CHAR_THRESHOLD = 1800;
const COLLAPSE_LINE_THRESHOLD = 30;

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** File-type icon. Declared outside the card so it isn't re-created on each render. */
function DocumentIcon({
  mime,
  name,
  className,
}: {
  mime?: string;
  name?: string;
  className?: string;
}) {
  const lowerMime = (mime || "").toLowerCase();
  const lowerName = (name || "").toLowerCase();
  if (lowerMime === "text/csv" || lowerName.endsWith(".csv")) {
    return <FileSpreadsheet className={className} />;
  }
  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    return <FileType className={className} />;
  }
  return <FileText className={className} />;
}

export function DocumentCard({
  response,
  workspaceId,
  userId,
  canEdit = true,
  canAsk = true,
  canExport = true,
  memberCount = 1,
  onDelete,
  className,
}: DocumentCardProps) {
  const t = useTranslations("Documents");
  const tReview = useTranslations("Review");
  const tGates = useTranslations("Documents.caps");
  // Download formats come from the workspace owner's plan (decided 2026-11-14).
  const { data: workspace } = useWorkspace(userId, workspaceId);
  const [annotations, setAnnotations] = React.useState<AnnotationItem[]>([]);
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  const activeVer = response.activeVersion;
  const activeVersionId =
    response.activeVersionId || activeVer?.id || `ver-${response.id}`;
  const savedContent =
    activeVer?.content ?? response.content ?? response.response ?? "";
  const baseRevision = activeVer?.latestEdit?.revision ?? null;

  const draft = useDocumentDraftsStore((s) => s.drafts[activeVersionId]);
  const updateDraftContent = useDocumentDraftsStore(
    (s) => s.updateDraftContent
  );

  const displayedContent = draft ? draft.content : savedContent;
  const applyFixToDraft = useDocumentDraftsStore((s) => s.applyFixToDraft);
  const hasSavedEdits = Boolean(activeVer?.hasEdits || activeVer?.edited);

  const quickFix = React.useMemo(
    () => ({
      versionId: activeVersionId,
      responseId: response.id,
      savedContent,
      baseRevision,
      canEdit,
    }),
    [activeVersionId, response.id, savedContent, baseRevision, canEdit]
  );

  // Quick fixes of a review that can still be applied to the text shown.
  const pendingFixes = React.useMemo(() => {
    const applied = draft?.appliedSuggestionIds ?? [];
    return annotations.flatMap((a) => {
      if (a.authorType !== "AI" || a.resolvedAt || a.suggestionState !== "PENDING") return [];
      if (applied.includes(a.id)) return [];
      const target = toSuggestionTarget(a.suggestion);
      if (!target || !applySuggestion(displayedContent, target).ok) return [];
      return [{ id: a.id, target }];
    });
  }, [annotations, draft?.appliedSuggestionIds, displayedContent]);

  const handleAcceptAll = React.useCallback(() => {
    let applied = 0;
    for (const fix of pendingFixes) {
      // Each fix is applied to the draft as the previous one left it; one
      // whose passage was changed by an earlier fix is skipped.
      const res = applyFixToDraft({
        versionId: activeVersionId,
        baseRevision,
        baseContent: savedContent,
        suggestionId: fix.id,
        suggestion: fix.target,
      });
      if (res.ok) applied++;
    }
    if (applied > 0) {
      toast.success(tReview("allFixesApplied", { count: applied }), {
        description: tReview("fixAppliedHint"),
      });
    } else {
      toast.error(tReview("noFixesApplicable"));
    }
  }, [activeVersionId, applyFixToDraft, baseRevision, pendingFixes, savedContent, tReview]);

  const docName =
    response.uploadedAttachment?.originalName ||
    response.prompt ||
    t("fallbackName");
  const docMime = response.uploadedAttachment?.mime || "";
  const docBytes = response.uploadedAttachment?.bytes;
  const attachmentId = response.uploadedAttachment?.id;

  const isPdf =
    docMime.toLowerCase() === "application/pdf" ||
    docName.toLowerCase().endsWith(".pdf");

  // Only known right after the upload (it isn't stored). A "---" in the text
  // is a horizontal rule, not a page break, so it is never counted.
  const pageCount =
    typeof response.pageCount === "number" && response.pageCount > 0
      ? response.pageCount
      : null;

  const isLongDocument = React.useMemo(() => {
    if (displayedContent.length > COLLAPSE_CHAR_THRESHOLD) return true;
    const lineCount = displayedContent.split("\n").length;
    return lineCount > COLLAPSE_LINE_THRESHOLD;
  }, [displayedContent]);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }, [displayedContent]);

  const handleSaveEdit = React.useCallback(
    (newContent: string) => {
      updateDraftContent({
        versionId: activeVersionId,
        baseRevision,
        baseContent: savedContent,
        content: newContent,
      });
      setIsEditing(false);
    },
    [activeVersionId, baseRevision, savedContent, updateDraftContent]
  );

  const sizeLabel = formatFileSize(docBytes);
  const formattedDate = React.useMemo(() => {
    if (!response.createdAt) return null;
    const d =
      typeof response.createdAt === "string"
        ? new Date(response.createdAt)
        : response.createdAt;
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }, [response.createdAt]);

  return (
    <article
      id={`response-${response.id}`}
      data-response-id={response.id}
      data-response-kind="DOCUMENT"
      data-testid={`document-card-${response.id}`}
      className={cn(
        "group relative rounded-2xl border border-border border-l-4 border-l-info bg-surface p-4 sm:p-6 shadow-2xs transition-colors",
        className
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
            <DocumentIcon mime={docMime} name={docName} className="h-4 w-4" />
          </div>

          <Badge
            variant="secondary"
            className="bg-info/10 text-info border-info/20 font-medium text-xs"
            data-testid="uploaded-document-badge"
          >
            {t("uploadedBadge")}
          </Badge>

          <h3
            className="text-sm font-semibold text-fg truncate max-w-xs sm:max-w-md"
            title={docName}
          >
            {docName}
          </h3>

          {sizeLabel && (
            <span className="text-xs text-muted" data-testid="document-size">
              · {sizeLabel}
            </span>
          )}

          {isPdf && pageCount && (
            <span className="text-xs text-muted" data-testid="document-pages">
              · {t("pagesCount", { count: pageCount })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {response.author?.name && (
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Avatar className="h-5 w-5">
                {response.author.avatarUrl && (
                  <AvatarImage
                    src={response.author.avatarUrl}
                    alt={response.author.name}
                  />
                )}
                <AvatarFallback className="text-[10px] bg-surface-2 text-fg">
                  {response.author.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate max-w-28">{response.author.name}</span>
              {formattedDate && <span>· {formattedDate}</span>}
            </div>
          )}

          {/* Original file as uploaded, or the text as it is now (with the
              saved corrections) in a format of the reader's choice. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                data-testid="document-download-btn"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{t("download")}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {attachmentId && (
                <>
                  <DropdownMenuLabel className="text-[11px] font-medium text-muted">
                    {t("downloadOriginalLabel")}
                  </DropdownMenuLabel>
                  {/* The endpoint sends the file itself, so this is a plain link. */}
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <a
                      href={`/api/v1/attachments/${attachmentId}/download`}
                      download={docName}
                      data-testid="download-original-btn"
                    >
                      <span className="truncate">{t("downloadOriginal")}</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-[11px] font-medium text-muted">
                {hasSavedEdits ? t("downloadEditedLabel") : t("downloadCurrentLabel")}
              </DropdownMenuLabel>
              {(["docx", "pdf", "md"] as const).map((format) => {
                const reason = exportFormatGateReason({
                  format,
                  ownerFormats: workspace?.exportFormats,
                  isOwner: workspace?.role === "OWNER",
                  canExport,
                  markdownNeedsExport: true,
                  exportCapabilityLabel: tGates("export"),
                });
                return (
                  <Gated key={format} reason={reason} side="left" className="flex w-full">
                    <DropdownMenuItem asChild className="w-full cursor-pointer">
                      <a
                        href={`/api/v1/responses/${response.id}/export?format=${format}&view=edited`}
                        download
                        data-testid={`download-edited-${format}`}
                      >
                        <span>{t(`downloadFormats.${format}`)}</span>
                      </a>
                    </DropdownMenuItem>
                  </Gated>
                );
              })}
              {draft && (
                <p
                  className="px-2 py-1.5 text-[11px] text-muted"
                  data-testid="download-unsaved-note"
                >
                  {t("downloadUnsavedNote")}
                </p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* PDF layout warning note */}
      {isPdf && (
        <div
          className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted"
          data-testid="pdf-layout-note"
        >
          <Info className="h-3.5 w-3.5 text-info shrink-0" />
          <span>{t("pdfLayoutNote")}</span>
        </div>
      )}

      {/* Document Body (Edit mode vs AnswerBody with full DOM preserved for anchoring) */}
      {isEditing ? (
        <EditResponse
          initialContent={displayedContent}
          onSave={handleSaveEdit}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div className="relative">
          <div
            data-testid="document-body-container"
            className={cn(
              "transition-all",
              isLongDocument && !expanded && "max-h-[60vh] overflow-hidden"
            )}
          >
            <AnswerBody
              targetType="RESPONSE_VERSION"
              targetId={activeVersionId}
              responseId={response.id}
              workspaceId={workspaceId}
              content={displayedContent}
              variant="document"
              contentSource={baseRevision !== null ? "EDIT" : "ORIGINAL"}
              editRevision={baseRevision ?? undefined}
              quickFix={quickFix}
              onAnnotationsChange={setAnnotations}
              unsaved={Boolean(draft)}
            />
          </div>

          {isLongDocument && !expanded && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface via-surface/85 to-transparent"
              aria-hidden="true"
            />
          )}

          {isLongDocument && (
            <div className="mt-2 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
                data-testid="toggle-full-document-btn"
                className="h-8 gap-1.5 text-xs bg-surface hover:bg-surface-2"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>{t("showLess")}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>{t("showFull")}</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <DocumentReviewProgress versionId={activeVersionId} className="mt-3" />

      {/* Fixes of a review that are still open: one click takes them all. A
          single change is accepted from its highlight in the text. */}
      {pendingFixes.length > 0 && !isEditing && (
        <div
          data-testid="review-summary-bar"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-fg"
        >
          <span className="text-muted">
            {tReview("pendingFixes", { count: pendingFixes.length })}
          </span>
          <Gated
            reason={
              canEdit
                ? null
                : { code: "no_permission", capability: tReview("capEditResponse") }
            }
          >
            <Button
              type="button"
              size="sm"
              onClick={handleAcceptAll}
              data-testid="accept-all-fixes-btn"
              className="h-6 px-2.5 text-xs gap-1.5 bg-accent text-accent-fg hover:bg-accent/90"
            >
              <Wand2 className="h-3 w-3" />
              <span>{tReview("acceptAll", { count: pendingFixes.length })}</span>
            </Button>
          </Gated>
        </div>
      )}

      {draft && canEdit && !isEditing && (
        <DocumentDraftBar
          versionId={activeVersionId}
          workspaceId={workspaceId}
          userId={userId}
          savedContent={savedContent}
          draft={draft}
        />
      )}

      {/* Action bar: Copy, Edit, Ask Klecx to review, Share, Delete */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1.5 px-2 text-xs text-muted hover:text-fg"
            data-testid="document-copy-btn"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{t("copy")}</span>
          </Button>

          <Gated
            reason={
              canEdit
                ? null
                : { code: "no_permission", capability: t("caps.edit") }
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-7 gap-1.5 px-2 text-xs text-muted hover:text-fg"
              data-testid="document-edit-btn"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>{t("edit")}</span>
            </Button>
          </Gated>

          <DocumentReview
            versionId={activeVersionId}
            responseId={response.id}
            canAsk={canAsk}
            hasDraft={Boolean(draft)}
            hasMembers={memberCount > 1}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShareOpen(true)}
            className="h-7 gap-1.5 px-2 text-xs text-muted hover:text-fg"
            data-testid="document-share-btn"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>{t("share")}</span>
          </Button>
        </div>

        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(response.id)}
            className="h-7 gap-1.5 px-2 text-xs text-muted hover:text-danger"
            data-testid="document-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t("delete")}</span>
          </Button>
        )}
      </div>

      {shareOpen && (
        <ShareAndPeopleDialog
          workspaceId={workspaceId}
          currentUserId={userId}
          initialTab="public"
          initialScope="RESPONSE"
          initialResponseId={response.id}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </article>
  );
}
