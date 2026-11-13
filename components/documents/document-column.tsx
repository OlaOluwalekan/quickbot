"use client";

import * as React from "react";
import {
  ArrowLeft,
  Home,
  FileText,
  ChevronDown,
  Edit2,
  Check,
  X,
  History,
  MoreVertical,
  Loader2,
  Wand2,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnswerBody } from "@/components/response/answer-body";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import {
  DocumentReview,
  DocumentReviewProgress,
} from "@/components/response/document-review-popover";
import type { QuickFixContext } from "@/components/annotations/quick-fix";
import { GeneratedDocumentDownload } from "./generated-document-download";
import { cn } from "@/lib/utils";

export interface DocumentColumnProps {
  id: string;
  index: number;
  width: number;
  workspaceId: string;
  onBack: () => void;
  onCloseAll: () => void;
  /** Fallbacks until the document is loaded; the server's answer wins. */
  canEdit?: boolean;
  canComment?: boolean;
  canAsk?: boolean;
  className?: string;
}

interface RevisionData {
  id: string;
  documentId: string;
  revision: number;
  content: string;
  editorId: string | null;
  editor?: { id: string; name: string; image?: string | null } | null;
  createdAt: string;
}

interface DocumentData {
  document: {
    id: string;
    workspaceId: string;
    versionId: string;
    responseId?: string | null;
    title: string;
    format: string;
    currentRevision: number;
    createdById: string;
    createdAt: string;
  };
  latestRevision: RevisionData;
  revisions: RevisionData[];
  capabilities: {
    canEdit: boolean;
    canComment: boolean;
    canAsk: boolean;
    canExport: boolean;
  };
}

function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

/**
 * A generated document (F3.4) as a column of the thread stack: preview
 * (highlight → comment / ask / review), edit (Markdown) with a Save bar, and
 * downloads. Asks on the document open further columns to its right.
 */
export function DocumentColumn({
  id,
  index,
  width,
  workspaceId,
  onBack,
  onCloseAll,
  canEdit: propCanEdit = false,
  canAsk: propCanAsk = false,
  className,
}: DocumentColumnProps) {
  const t = useTranslations("GeneratedDocs");
  const tThreads = useTranslations("Threads");
  const tReview = useTranslations("Review");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  const [docData, setDocData] = React.useState<DocumentData | null>(null);
  const [selectedRevision, setSelectedRevision] = React.useState<number>(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"preview" | "edit">("preview");

  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleInput, setTitleInput] = React.useState("");
  const [isSavingTitle, setIsSavingTitle] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [isSavingRevision, setIsSavingRevision] = React.useState(false);

  // Drafts are keyed by document id (ids are unique across versions and documents).
  const draft = useDocumentDraftsStore((s) => s.drafts[id]);
  const updateDraftContent = useDocumentDraftsStore((s) => s.updateDraftContent);
  const discardDraft = useDocumentDraftsStore((s) => s.discardDraft);

  const loadDocument = React.useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const data = await api<DocumentData>(`/api/v1/documents/${id}`);
        setDocData(data);
        setSelectedRevision(data.document.currentRevision);
        setTitleInput(data.document.title);
      } catch {
        if (!silent) setDocData(null);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [id]
  );

  React.useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  const canEdit = docData?.capabilities.canEdit ?? propCanEdit;
  const canAsk = docData?.capabilities.canAsk ?? propCanAsk;
  const canExport = docData?.capabilities.canExport ?? false;

  const latest = docData?.latestRevision ?? null;
  const isViewingLatest = docData
    ? selectedRevision === docData.document.currentRevision
    : true;
  const activeRevisionData = React.useMemo(() => {
    if (!docData) return null;
    return (
      docData.revisions.find((r) => r.revision === selectedRevision) ??
      docData.latestRevision
    );
  }, [docData, selectedRevision]);

  // The draft belongs to the latest revision; older revisions are read-only.
  const savedContent = latest?.content ?? "";
  const hasUnsavedChanges =
    isViewingLatest && draft !== undefined && draft.content !== savedContent;
  const displayedContent = hasUnsavedChanges
    ? draft!.content
    : (activeRevisionData?.content ?? "");

  const quickFix = React.useMemo<QuickFixContext | undefined>(
    () =>
      docData && isViewingLatest
        ? {
            versionId: id,
            responseId: docData.document.responseId ?? null,
            savedContent,
            baseRevision: docData.document.currentRevision,
            canEdit,
          }
        : undefined,
    [docData, isViewingLatest, id, savedContent, canEdit]
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!docData) return;
    updateDraftContent({
      versionId: id,
      baseRevision: docData.document.currentRevision,
      baseContent: savedContent,
      content: e.target.value,
    });
  };

  const handleSaveRevision = async () => {
    if (!docData || !draft) return;
    setIsSavingRevision(true);
    try {
      await api(`/api/v1/documents/${id}/revisions`, {
        method: "POST",
        json: {
          content: draft.content,
          baseRevision: draft.baseRevision ?? docData.document.currentRevision,
          acceptedSuggestionIds:
            draft.appliedSuggestionIds.length > 0
              ? draft.appliedSuggestionIds
              : undefined,
        },
      });
      discardDraft(id);
      toast.success(t("saveSuccess"));
      await loadDocument(true);
      window.dispatchEvent(
        new CustomEvent("annotation-changed", { detail: { documentId: id } })
      );
    } catch (err) {
      toast.error(errorCode(err) === "edit_conflict" ? t("saveConflict") : t("saveFailed"));
    } finally {
      setIsSavingRevision(false);
    }
  };

  const handleDiscard = () => {
    discardDraft(id);
    toast.info(t("discarded"));
  };

  const handleSaveTitle = async () => {
    const next = titleInput.trim();
    if (!docData || !next) return;
    setIsSavingTitle(true);
    try {
      await api(`/api/v1/documents/${id}`, {
        method: "PATCH",
        json: { title: next },
      });
      setDocData((prev) =>
        prev ? { ...prev, document: { ...prev.document, title: next } } : prev
      );
      setIsEditingTitle(false);
      toast.success(t("renamed"));
    } catch {
      toast.error(t("renameFailed"));
    } finally {
      setIsSavingTitle(false);
    }
  };

  if (isLoading || !docData) {
    return (
      <div
        style={{ width }}
        className={cn(
          "flex flex-col h-full border-r border-border bg-surface items-center justify-center p-6 text-center",
          className
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-accent mb-2" />
            <span className="text-xs text-muted">{t("loading")}</span>
          </>
        ) : (
          <>
            <FileText className="h-8 w-8 text-muted mb-2" />
            <h3 className="font-semibold text-sm text-foreground">{t("notFound")}</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onBack}
              className="mt-4 text-xs"
            >
              {tThreads("back")}
            </Button>
          </>
        )}
      </div>
    );
  }

  const isPdf = docData.document.format.toLowerCase() === "pdf";
  const revisionLabel = (rev: RevisionData) =>
    t("revisionBy", {
      revision: rev.revision,
      name: rev.editor?.name || tThreads("assistantName"),
      when: format.relativeTime(new Date(rev.createdAt), now),
    });

  return (
    <div
      style={{ width }}
      data-testid={`document-column-${id}`}
      className={cn(
        "flex flex-col h-full border-r border-border bg-surface overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col border-b border-border bg-surface shrink-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="column-back-btn"
              onClick={onBack}
              aria-label={tThreads("back")}
              title={tThreads("back")}
              className="h-7 w-7 text-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="column-main-btn"
              onClick={onCloseAll}
              aria-label={tThreads("main")}
              title={tThreads("main")}
              className="h-7 w-7 text-muted hover:text-foreground"
            >
              <Home className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold text-muted px-1">
              {tThreads("level", { level: index })}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <GeneratedDocumentDownload
              documentId={id}
              format={docData.document.format}
              revision={selectedRevision}
              canExport={canExport}
              size="sm"
            />

            {canAsk && (
              <DocumentReview
                versionId={id}
                documentId={id}
                responseId={docData.document.responseId ?? id}
                canAsk={canAsk}
                hasDraft={hasUnsavedChanges}
                mode="dialog"
                open={reviewOpen}
                onOpenChange={setReviewOpen}
              />
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-testid="doc-col-more-menu"
                  aria-label={t("moreActions")}
                  title={t("moreActions")}
                  className="h-7 w-7 text-muted hover:text-foreground"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canAsk && (
                  <DropdownMenuItem
                    data-testid="menu-ask-review"
                    onClick={() => setReviewOpen(true)}
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-2 text-accent" />
                    <span>{tReview("askKlecxReview")}</span>
                  </DropdownMenuItem>
                )}
                {canEdit && !isEditingTitle && (
                  <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-2 text-muted" />
                    <span>{t("rename")}</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title & revision */}
        <div className="px-3 pb-2.5 pt-0.5">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                autoFocus
                maxLength={120}
                aria-label={t("titleLabel")}
                className="h-7 text-xs bg-surface-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleSaveTitle}
                disabled={isSavingTitle}
                aria-label={t("saveTitle")}
                title={t("saveTitle")}
                className="h-7 w-7 text-accent"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setIsEditingTitle(false)}
                aria-label={t("cancelRename")}
                title={t("cancelRename")}
                className="h-7 w-7 text-muted"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-sm text-foreground truncate">
                {docData.document.title}
              </h2>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="revision-selector-btn"
                    aria-label={t("revisionHistory")}
                    className="h-6 gap-1 px-1.5 text-[11px] font-medium text-muted hover:text-foreground"
                  >
                    <History className="h-3 w-3" />
                    <span>{t("revision", { revision: selectedRevision })}</span>
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  {docData.revisions.map((rev) => (
                    <DropdownMenuItem
                      key={rev.id}
                      onClick={() => setSelectedRevision(rev.revision)}
                      className={cn(
                        "text-xs",
                        rev.revision === selectedRevision && "font-semibold text-accent"
                      )}
                    >
                      {revisionLabel(rev)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <DocumentReviewProgress versionId={id} className="mx-3 mt-2" />

      {/* Preview | Edit */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "preview" | "edit")}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex items-center justify-between px-3 border-b border-border bg-surface shrink-0">
          <TabsList className="h-8 bg-transparent p-0 gap-3">
            <TabsTrigger
              value="preview"
              data-testid="tab-preview"
              onClick={() => setActiveTab("preview")}
              className="h-8 rounded-none border-b-2 border-transparent px-2 text-xs font-medium text-muted data-[state=active]:border-accent data-[state=active]:text-foreground bg-transparent shadow-none"
            >
              {t("preview")}
            </TabsTrigger>
            {canEdit && (
              <TabsTrigger
                value="edit"
                data-testid="tab-edit"
                onClick={() => setActiveTab("edit")}
                className="h-8 rounded-none border-b-2 border-transparent px-2 text-xs font-medium text-muted data-[state=active]:border-accent data-[state=active]:text-foreground bg-transparent shadow-none"
              >
                {t("edit")}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 m-0 outline-none">
          <AnswerBody
            content={displayedContent}
            responseId={docData.document.responseId ?? undefined}
            workspaceId={workspaceId}
            targetType="DOCUMENT_REVISION"
            targetId={id}
            documentId={id}
            documentRevision={selectedRevision}
            depth={index}
            unsaved={hasUnsavedChanges}
            quickFix={quickFix}
            variant="document"
          />
        </TabsContent>

        {canEdit && (
          <TabsContent
            value="edit"
            className="flex flex-col flex-1 overflow-hidden p-0 m-0 outline-none"
          >
            {isPdf && (
              <div className="bg-surface-2 px-3 py-1.5 text-[11px] text-muted border-b border-border">
                {t("editPdfSource")}
              </div>
            )}
            {!isViewingLatest && (
              <div className="bg-surface-2 px-3 py-1.5 text-[11px] text-muted border-b border-border">
                {t("oldRevisionReadOnly")}
              </div>
            )}
            <textarea
              value={displayedContent}
              onChange={handleContentChange}
              disabled={!isViewingLatest}
              data-testid="document-editor-textarea"
              aria-label={t("editorLabel")}
              placeholder={t("editorPlaceholder")}
              className="flex-1 w-full resize-none p-4 bg-transparent text-sm font-mono text-foreground leading-relaxed focus:outline-none"
            />
          </TabsContent>
        )}
      </Tabs>

      {hasUnsavedChanges && canEdit && (
        <div
          data-testid="doc-save-bar"
          className="flex items-center justify-between border-t border-border bg-surface-2 px-3 py-2 shrink-0"
        >
          <span className="text-xs text-muted truncate mr-2">{t("unsavedChanges")}</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="doc-discard-btn"
              onClick={handleDiscard}
              className="h-7 text-xs text-muted hover:text-foreground"
            >
              {t("discard")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              data-testid="doc-save-btn"
              onClick={handleSaveRevision}
              disabled={isSavingRevision}
              className="h-7 gap-1 px-3 text-xs"
            >
              {isSavingRevision ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              <span>{t("save")}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
