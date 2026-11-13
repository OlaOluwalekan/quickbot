"use client";

import * as React from "react";
import {
  ArrowLeft,
  Home,
  FileText,
  Download,
  ChevronDown,
  Edit2,
  Check,
  X,
  History,
  MoreVertical,
  Loader2,
  Wand2,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
import { DocumentReview } from "@/components/response/document-review-popover";
import { Gated } from "@/components/ui/gated";
import { cn } from "@/lib/utils";

export interface DocumentColumnProps {
  id: string;
  index: number;
  width: number;
  workspaceId: string;
  onBack: () => void;
  onCloseAll: () => void;
  canEdit?: boolean;
  canComment?: boolean;
  canAsk?: boolean;
  canExport?: boolean;
  className?: string;
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
  latestRevision: {
    id: string;
    documentId: string;
    revision: number;
    content: string;
    editorId: string | null;
    editor?: { id: string; name: string; image?: string | null } | null;
    createdAt: string;
  };
  revisions: Array<{
    id: string;
    documentId: string;
    revision: number;
    content: string;
    editorId: string | null;
    editor?: { id: string; name: string; image?: string | null } | null;
    createdAt: string;
  }>;
  capabilities: {
    canEdit: boolean;
    canComment: boolean;
    canAsk: boolean;
    canExport: boolean;
  };
}

export function DocumentColumn({
  id,
  index,
  width,
  workspaceId,
  onBack,
  onCloseAll,
  canEdit: propCanEdit = true,
  canComment = true,
  canAsk = true,
  canExport = true,
  className,
}: DocumentColumnProps) {
  const t = useTranslations("GeneratedDocs");
  const tThreads = useTranslations("Threads");

  const [docData, setDocData] = React.useState<DocumentData | null>(null);
  const [selectedRevision, setSelectedRevision] = React.useState<number>(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"preview" | "edit">("preview");

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleInput, setTitleInput] = React.useState("");
  const [isSavingTitle, setIsSavingTitle] = React.useState(false);

  // Review dialog state
  const [reviewOpen, setReviewOpen] = React.useState(false);

  // Draft store
  const drafts = useDocumentDraftsStore((s) => s.drafts);
  const updateDraftContent = useDocumentDraftsStore((s) => s.updateDraftContent);
  const discardDraft = useDocumentDraftsStore((s) => s.discardDraft);

  const existingDraft = drafts[id];
  const draftContent = existingDraft?.content;

  const loadDocument = React.useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const res = await api<{ data: DocumentData }>(`/api/v1/documents/${id}`);
        setDocData(res.data);
        setSelectedRevision(res.data.document.currentRevision);
        setTitleInput(res.data.document.title);
      } catch (err) {
        if (!silent) setDocData(null);
        toast.error("Failed to load document");
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

  const activeRevisionData = React.useMemo(() => {
    if (!docData) return null;
    return (
      docData.revisions.find((r) => r.revision === selectedRevision) ??
      docData.latestRevision
    );
  }, [docData, selectedRevision]);

  const baseContent = activeRevisionData?.content ?? "";
  const displayedContent = draftContent !== undefined ? draftContent : baseContent;
  const isViewingLatest = docData ? selectedRevision === docData.document.currentRevision : true;
  const hasUnsavedChanges = draftContent !== undefined && draftContent !== baseContent;

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!docData) return;
    const nextText = e.target.value;
    updateDraftContent({
      versionId: id,
      baseRevision: docData.document.currentRevision,
      baseContent,
      content: nextText,
    });
  };

  const [isSavingRevision, setIsSavingRevision] = React.useState(false);
  const handleSaveRevision = async () => {
    if (!docData || draftContent === undefined) return;
    setIsSavingRevision(true);
    try {
      await api(`/api/v1/documents/${id}/revisions`, {
        method: "POST",
        json: {
          content: draftContent,
          baseRevision: docData.document.currentRevision,
        },
      });
      discardDraft(id);
      toast.success(t("saveSuccess"));
      await loadDocument(true);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save revision");
    } finally {
      setIsSavingRevision(false);
    }
  };

  const handleDiscard = () => {
    discardDraft(id);
    toast.info(t("discarded"));
  };

  const handleSaveTitle = async () => {
    if (!docData || !titleInput.trim()) return;
    setIsSavingTitle(true);
    try {
      await api(`/api/v1/documents/${id}`, {
        method: "PATCH",
        json: { title: titleInput.trim() },
      });
      setDocData((prev) =>
        prev
          ? {
              ...prev,
              document: { ...prev.document, title: titleInput.trim() },
            }
          : prev
      );
      setIsEditingTitle(false);
      toast.success("Document renamed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to rename document");
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleDownload = (fmt: string) => {
    if (!docData) return;
    const url = `/api/v1/documents/${id}/download?format=${fmt}&revision=${selectedRevision}`;
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "";
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div
        style={{ width }}
        className={cn(
          "flex flex-col h-full border-r border-border bg-surface items-center justify-center",
          className
        )}
      >
        <Loader2 className="h-6 w-6 animate-spin text-accent mb-2" />
        <span className="text-xs text-muted">Loading document…</span>
      </div>
    );
  }

  if (!docData) {
    return (
      <div
        style={{ width }}
        className={cn(
          "flex flex-col h-full border-r border-border bg-surface items-center justify-center p-6 text-center",
          className
        )}
      >
        <FileText className="h-8 w-8 text-muted mb-2" />
        <h3 className="font-semibold text-sm text-foreground">Document not found</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onBack}
          className="mt-4 text-xs"
        >
          {tThreads("back")}
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{ width }}
      data-testid={`document-column-${id}`}
      className={cn(
        "flex flex-col h-full border-r border-border bg-surface overflow-hidden",
        className
      )}
    >
      {/* Column Header */}
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
              className="h-7 w-7 text-muted hover:text-foreground"
            >
              <Home className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold text-muted px-1">
              Level {index}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <div className="inline-flex rounded-md shadow-xs">
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="doc-col-download-btn"
                onClick={() => handleDownload(docData.document.format)}
                className="h-7 gap-1.5 rounded-r-none px-2 text-xs font-medium border-border hover:bg-surface-2"
              >
                <Download className="h-3 w-3 text-muted" />
                <span>{t("download")}</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="doc-col-download-menu"
                    className="h-7 rounded-l-none border-l-0 px-1 text-xs border-border hover:bg-surface-2"
                  >
                    <ChevronDown className="h-3 w-3 text-muted" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => handleDownload("md")}>
                    Markdown (.md)
                  </DropdownMenuItem>
                  <Gated
                    reason={
                      canExport
                        ? null
                        : { code: "no_permission", capability: t("formatNotAllowed") }
                    }
                  >
                    <DropdownMenuItem onClick={() => handleDownload("pdf")}>
                      PDF (.pdf)
                    </DropdownMenuItem>
                  </Gated>
                  <Gated
                    reason={
                      canExport
                        ? null
                        : { code: "no_permission", capability: t("formatNotAllowed") }
                    }
                  >
                    <DropdownMenuItem onClick={() => handleDownload("docx")}>
                      Word (.docx)
                    </DropdownMenuItem>
                  </Gated>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {canAsk && docData.document.versionId && (
              <DocumentReview
                versionId={docData.document.versionId}
                responseId={docData.document.responseId || docData.document.versionId}
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
                    <span>Ask Klecx to review</span>
                  </DropdownMenuItem>
                )}
                {canEdit && !isEditingTitle && (
                  <DropdownMenuItem onClick={() => setIsEditingTitle(true)}>
                    <Edit2 className="h-3.5 w-3.5 mr-2 text-muted" />
                    <span>Rename</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Title & Revision Bar */}
        <div className="px-3 pb-2.5 pt-0.5">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                autoFocus
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
                className="h-7 w-7 text-accent"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setIsEditingTitle(false)}
                className="h-7 w-7 text-muted"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <h2
                onClick={() => canEdit && setIsEditingTitle(true)}
                title={canEdit ? "Click to rename" : undefined}
                className={cn(
                  "font-bold text-sm text-foreground truncate",
                  canEdit && "hover:text-accent cursor-pointer"
                )}
              >
                {docData.document.title}
              </h2>

              {/* Revision Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="revision-selector-btn"
                    className="h-6 gap-1 px-1.5 text-[11px] font-medium text-muted hover:text-foreground"
                  >
                    <History className="h-3 w-3" />
                    <span>Rev {selectedRevision}</span>
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {docData.revisions.map((rev) => (
                    <DropdownMenuItem
                      key={rev.id}
                      onClick={() => setSelectedRevision(rev.revision)}
                      className={cn(
                        "flex items-center justify-between text-xs",
                        rev.revision === selectedRevision && "font-semibold text-accent"
                      )}
                    >
                      <span>Revision {rev.revision}</span>
                      <span className="text-[10px] text-muted">
                        {rev.editor?.name || "Klecx"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Preview | Edit */}
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

          {hasUnsavedChanges && (
            <span className="text-[10px] text-warning font-medium">
              {t("unsavedChanges")}
            </span>
          )}
        </div>

        {/* Tab 1: Preview */}
        <TabsContent
          value="preview"
          className="flex-1 overflow-y-auto p-4 m-0 outline-none"
        >
          <AnswerBody
            content={displayedContent}
            responseId={docData.document.responseId || id}
            workspaceId={workspaceId}
            targetType="DOCUMENT_REVISION"
            targetId={id}
            documentId={id}
            documentRevision={selectedRevision}
            depth={index}
            unsaved={hasUnsavedChanges}
            variant={docData.document.format.toLowerCase() === "pdf" ? "document" : undefined}
          />
        </TabsContent>

        {/* Tab 2: Edit */}
        {canEdit && (
          <TabsContent
            value="edit"
            className="flex flex-col flex-1 overflow-hidden p-0 m-0 outline-none"
          >
            {docData.document.format.toLowerCase() === "pdf" && (
              <div className="bg-surface-2 px-3 py-1.5 text-[11px] text-muted border-b border-border">
                {t("editPdfSource")}
              </div>
            )}
            <textarea
              value={displayedContent}
              onChange={handleContentChange}
              disabled={!isViewingLatest}
              data-testid="document-editor-textarea"
              placeholder="Write document in Markdown…"
              className="flex-1 w-full resize-none p-4 bg-transparent text-sm font-mono text-foreground leading-relaxed focus:outline-none"
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Save Draft Bar */}
      {hasUnsavedChanges && (
        <div
          data-testid="doc-save-bar"
          className="flex items-center justify-between border-t border-border bg-surface-2 px-3 py-2 shrink-0 animate-in fade-in"
        >
          <span className="text-xs text-muted truncate mr-2">
            {t("unsavedChanges")}
          </span>
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
              className="h-7 gap-1 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
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
