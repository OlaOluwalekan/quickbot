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
  Sparkles,
  Share2,
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
import { ShareAndPeopleDialog } from "@/components/workspace/ShareAndPeopleDialog";
import { useCreateResponseEdit } from "@/lib/api/hooks/responses";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { ResponseItemData } from "./response-card";

export interface DocumentCardProps {
  response: ResponseItemData;
  workspaceId: string;
  userId: string;
  onDelete?: (responseId: string) => void;
  onReviewDocument?: (responseId: string) => void;
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
  onDelete,
  onReviewDocument,
  className,
}: DocumentCardProps) {
  const t = useTranslations("Documents");
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  const activeVer = response.activeVersion;
  const activeVersionId =
    response.activeVersionId || activeVer?.id || `ver-${response.id}`;
  const displayedContent =
    activeVer?.content ?? response.content ?? response.response ?? "";

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

  const createEditMutation = useCreateResponseEdit(userId, workspaceId);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  }, [displayedContent]);

  const handleDownloadOriginal = React.useCallback(async () => {
    if (!attachmentId || downloading) return;
    setDownloading(true);
    try {
      const res = await api<{ url: string }>(
        `/api/v1/attachments/${attachmentId}/download`
      );
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error(t("errors.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  }, [attachmentId, downloading, t]);

  const handleSaveEdit = React.useCallback(
    async (newContent: string) => {
      await createEditMutation.mutateAsync({
        responseId: response.id,
        input: { content: newContent },
      });
      setIsEditing(false);
    },
    [createEditMutation, response.id]
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

          {attachmentId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadOriginal}
              disabled={downloading}
              data-testid="download-original-btn"
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t("downloadOriginal")}</span>
            </Button>
          )}
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
          isSaving={createEditMutation.isPending}
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

          {/* The AI review arrives with F3.3: no button until it does something. */}
          {onReviewDocument && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onReviewDocument(response.id)}
              className="h-7 gap-1.5 px-2 text-xs text-muted hover:text-fg"
              data-testid="ask-klecx-review-btn"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>{t("askKlecxReview")}</span>
            </Button>
          )}

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
