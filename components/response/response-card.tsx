"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RotateCcw,
  Edit2,
  Volume2,
  Share2,
  FileDown,
  MoreHorizontal,
  Sparkles,
  Download,
  Maximize2,
  Trash2,
  Link as LinkIcon,
  Eye,
  History,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnswerBody } from "./answer-body";
import { PromptAttachmentPreview } from "./prompt-attachment-preview";
import { EditResponse } from "./edit-response";
import { DocumentReview, DocumentReviewProgress } from "./document-review-popover";
import { DocumentDraftBar } from "./document-draft-bar";
import { GeneratedDocumentCard } from "@/components/documents/generated-document-card";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import { ShareAndPeopleDialog } from "@/components/workspace/ShareAndPeopleDialog";
import { useUiStore } from "@/lib/stores/ui";
import { openAnnotationThread } from "@/lib/stores/thread-stack";
import {
  useResponseVersions,
  useSwitchActiveVersion,
  useCreateResponseEdit,
  type ResponseVersionDto,
} from "@/lib/api/hooks/responses";
import { useWorkspace } from "@/lib/api/hooks/workspaces";
import type { CitationDto } from "@/lib/api/sse";

export interface ResponseItemData {
  id: string;
  workspaceId: string;
  prompt: string;
  kind?: "TEXT" | "IMAGE" | "DOCUMENT" | string;
  origin?: "DIRECT" | "PROMOTED" | "UPLOAD" | string;
  quote?: string | null;
  sourceAnnotationId?: string | null;
  sourceWorkspaceId?: string | null;
  sourceChain?: Array<{ id: string; quote: string; depth: number }> | null;
  sourceRemoved?: boolean;
  sourceAccessible?: boolean;
  sortAt?: string | Date;
  response?: string;
  content?: string;
  versionCount?: number;
  activeVersionId?: string | null;
  createdAt?: string | Date;
  citations?: CitationDto[];
  activeVersion?: {
    id: string;
    number: number;
    status?: string;
    content: string;
    originalContent?: string;
    thoughtSummary?: string | null;
    modelKey?: string | null;
    edited?: boolean;
    hasEdits?: boolean;
    latestEdit?: {
      id?: string;
      revision?: number;
      content?: string;
    } | null;
    latestEditContent?: string | null;
    citations?: CitationDto[];
    documents?: Array<{
      id: string;
      title: string;
      format: string;
      currentRevision: number;
      createdAt?: string | Date;
    }>;
  } | null;
  author?: {
    name?: string;
    avatarUrl?: string;
  };
  attachments?: Array<{
    id: string;
    kind: string;
    originalName: string;
    mime: string;
    bytes: number;
    width?: number | null;
    height?: number | null;
  }>;
  generatedDocuments?: Array<{
    id: string;
    kind: string;
    originalName: string;
    mime: string;
    bytes: number;
  }>;
  uploadedAttachment?: {
    id: string;
    originalName: string;
    mime: string;
    bytes: number;
    createdAt?: string | Date;
  } | null;
  pageCount?: number | null;
  totalRows?: number | null;
  truncated?: boolean;
}

export interface ResponseCardProps {
  response: ResponseItemData;
  workspaceId: string;
  userId: string;
  memberCount?: number;
  /** False when the member may not ask Klecx (no `workspace.ask`). The server re-checks. */
  canAsk?: boolean;
  /** False when the member may not edit responses. The server re-checks. */
  canEditResponse?: boolean;
  onRegenerate?: (responseId: string) => void;
  onDelete?: (responseId: string) => void;
  isRegenerating?: boolean;
  isFirstPrompt?: boolean;
  className?: string;
}

function isDirectUrl(val: string): boolean {
  return (
    val.startsWith("http://") ||
    val.startsWith("https://") ||
    val.startsWith("data:image/")
  );
}

export function ResponseCard({
  response,
  workspaceId,
  userId,
  memberCount = 1,
  canAsk = true,
  canEditResponse,
  onRegenerate,
  onDelete,
  isRegenerating = false,
  isFirstPrompt = false,
  className,
}: ResponseCardProps) {
  const t = useTranslations("Response");
  const tReview = useTranslations("Review");
  const [isEditing, setIsEditing] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"edited" | "original">(
    "edited"
  );
  const [copied, setCopied] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [chainExpanded, setChainExpanded] = React.useState(false);
  // Public links require `workspace.share` (owner/admin); everyone else sees a disabled button
  const { data: workspace } = useWorkspace(userId, workspaceId);
  const canShare = workspace?.role === "OWNER" || workspace?.role === "ADMIN";
  const canEdit = canEditResponse ?? workspace?.role !== "VIEWER";
  const currentPageTitle = useUiStore((s) => s.currentPageTitle);
  const [signedUrlsByAttachmentId, setSignedUrlsByAttachmentId] = React.useState<
    Record<string, string>
  >({});

  // Queries & Mutations
  const { data: versionsData } = useResponseVersions(userId, response.id);
  const switchVersionMutation = useSwitchActiveVersion(userId, workspaceId);
  const createEditMutation = useCreateResponseEdit(userId, workspaceId);

  // Local state for optimistic version switching
  const [selectedVersionId, setSelectedVersionId] = React.useState<
    string | null
  >(null);

  // Sync selectedVersionId when response.activeVersionId changes
  React.useEffect(() => {
    if (response.activeVersionId) {
      setSelectedVersionId(response.activeVersionId);
    }
  }, [response.activeVersionId]);

  // Support both raw array ResponseVersionDto[] and { versions: ResponseVersionDto[] }
  const versions: ResponseVersionDto[] = React.useMemo(() => {
    if (Array.isArray(versionsData)) {
      return versionsData;
    }
    if (
      versionsData &&
      Array.isArray(
        (versionsData as unknown as { versions?: ResponseVersionDto[] })
          .versions
      )
    ) {
      return (versionsData as unknown as { versions: ResponseVersionDto[] })
        .versions;
    }
    return [];
  }, [versionsData]);

  // Current active version resolution
  const currentActiveId =
    selectedVersionId || response.activeVersionId || response.activeVersion?.id;

  const activeVerFromList = versions.find((v) => v.id === currentActiveId);
  const activeVer = activeVerFromList || response.activeVersion;

  const activeCitations: CitationDto[] = React.useMemo(() => {
    if (activeVerFromList?.citations) {
      return activeVerFromList.citations;
    }
    if (response.activeVersion?.citations && (!selectedVersionId || selectedVersionId === response.activeVersion.id)) {
      return response.activeVersion.citations;
    }
    return response.citations ?? [];
  }, [activeVerFromList, response.activeVersion, response.citations, selectedVersionId]);

  const versionCount = Math.max(response.versionCount || 1, versions.length);

  const activeNumber =
    activeVerFromList?.number ||
    activeVerFromList?.versionNumber ||
    (versions.length > 0 && currentActiveId
      ? versions.findIndex((v) => v.id === currentActiveId) + 1
      : response.activeVersion?.number || 1);

  // Content resolution (viewing edited vs original)
  const originalText =
    activeVer?.originalContent ||
    activeVer?.content ||
    response.content ||
    response.response ||
    "";

  const hasEdits = Boolean(
    activeVer?.edited ||
      activeVer?.hasEdits ||
      (activeVer?.latestEditContent &&
        activeVer.latestEditContent !== originalText)
  );

  const editedText =
    activeVer?.latestEditContent || activeVer?.content || originalText;
  // Review fixes (F3.3) are collected in an unsaved draft of the current
  // text, like on documents, and saved from the bar under the answer.
  const reviewVersionId = activeVer?.id || response.activeVersionId || "";
  const draft = useDocumentDraftsStore((s) =>
    reviewVersionId ? s.drafts[reviewVersionId] : undefined
  );
  const showsDraft = Boolean(draft) && viewMode === "edited";
  const baseRevision =
    (activeVer?.latestEdit as { revision?: number } | null | undefined)?.revision ?? null;
  const quickFix = React.useMemo(
    () =>
      reviewVersionId && viewMode === "edited"
        ? {
            versionId: reviewVersionId,
            responseId: response.id,
            savedContent: editedText,
            baseRevision,
            canEdit,
          }
        : undefined,
    [reviewVersionId, viewMode, response.id, editedText, baseRevision, canEdit]
  );

  const displayedContent = (
    hasEdits && viewMode === "original"
      ? originalText
      : showsDraft && draft
        ? draft.content
        : editedText
  ).trim();

  // Prompt truncation helper (> 6 lines or > 300 chars)
  const isPromptLong =
    response.prompt.length > 300 || response.prompt.split("\n").length > 6;

  // Model key formatting
  const modelKey =
    activeVer?.modelKey ||
    (response.kind === "IMAGE" ? "image-standard" : "text-economy");
  const modelName = modelKey.includes("pro")
    ? t("modelPro")
    : modelKey.includes("economy")
      ? t("modelEconomy")
      : t("modelStandard");

  const isImageResponse =
    response.kind === "IMAGE" ||
    (displayedContent.startsWith("http") &&
      (displayedContent.includes("cloudinary") ||
        displayedContent.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null));

  // Resolve signed URL when displayedContent is an attachment ID (Step 5.4)
  const imageAttachmentId =
    isImageResponse && displayedContent && !isDirectUrl(displayedContent)
      ? displayedContent
      : null;

  React.useEffect(() => {
    if (!imageAttachmentId || signedUrlsByAttachmentId[imageAttachmentId]) {
      return;
    }

    let cancelled = false;
    fetch(`/api/v1/attachments/${encodeURIComponent(imageAttachmentId)}/url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const signedUrl = data?.url ?? data?.data?.url;
        if (!cancelled && signedUrl) {
          setSignedUrlsByAttachmentId((prev) => ({
            ...prev,
            [imageAttachmentId]: signedUrl,
          }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [imageAttachmentId, signedUrlsByAttachmentId]);

  const resolvedImageUrl = isImageResponse
    ? isDirectUrl(displayedContent)
      ? displayedContent
      : imageAttachmentId
        ? signedUrlsByAttachmentId[imageAttachmentId] ?? null
        : null
    : null;

  // Version navigation
  const handleSwitchVersion = (direction: "prev" | "next") => {
    if (versions.length <= 1) return;
    const currentIdx = versions.findIndex((v) => v.id === currentActiveId);
    if (currentIdx === -1) return;

    let targetIdx = currentIdx;
    if (direction === "prev" && currentIdx > 0) {
      targetIdx = currentIdx - 1;
    } else if (direction === "next" && currentIdx < versions.length - 1) {
      targetIdx = currentIdx + 1;
    }

    if (targetIdx !== currentIdx) {
      const targetVersion = versions[targetIdx];
      if (targetVersion) {
        setSelectedVersionId(targetVersion.id);
        switchVersionMutation.mutate(
          {
            responseId: response.id,
            input: { versionId: targetVersion.id },
          },
          {
            onError: () => {
              setSelectedVersionId(currentActiveId || null);
            },
          }
        );
      }
    }
  };

  const handleVersionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleSwitchVersion("prev");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleSwitchVersion("next");
    }
  };

  // Copy action
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resolvedImageUrl || displayedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Copy response permalink
  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/workspaces/${workspaceId}#response-${response.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Save edit
  const handleSaveEdit = async (newContent: string) => {
    // The editor opened on the text shown, which holds the review fixes not
    // saved yet: this save keeps them, so they are recorded as accepted and
    // the draft is done.
    const appliedFixes = showsDraft ? (draft?.appliedSuggestionIds ?? []) : [];
    await createEditMutation.mutateAsync({
      responseId: response.id,
      input: {
        content: newContent,
        acceptedSuggestionIds: appliedFixes.length > 0 ? appliedFixes : undefined,
      },
    });
    if (showsDraft && reviewVersionId) {
      useDocumentDraftsStore.getState().clearDraft(reviewVersionId);
    }
    setViewMode("edited");
    setIsEditing(false);
  };

  return (
    <div
      id={`response-${response.id}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 180px" }}
      className={cn("group space-y-4", className)}
    >
      {/* 1. User Prompt Bubble */}
      <div className="flex justify-end">
        <div
          className={cn(
            "bg-surface-2 border-border text-fg max-w-2xl rounded-2xl border px-4 py-2.5 text-sm shadow-2xs sm:text-base",
            isFirstPrompt && "vt-first-prompt"
          )}
        >
          {response.quote && (
            <div
              className="mb-2.5 rounded-lg border-l-2 border-accent bg-surface-3/80 p-2.5 text-xs text-fg-muted"
              data-testid="promoted-quote"
            >
              <p className="line-clamp-3 italic">“{response.quote}”</p>
              {(() => {
                const chain = response.sourceChain ?? null;
                const hasNestedChain = Boolean(chain && chain.length > 1);
                const level =
                  chain && chain.length > 0
                    ? chain[chain.length - 1]!.depth + 1
                    : null;
                const isCrossWorkspace =
                  Boolean(response.sourceWorkspaceId) &&
                  response.sourceWorkspaceId !== workspaceId;
                const crossThreadHref =
                  isCrossWorkspace && response.sourceWorkspaceId
                    ? chain && chain.length > 0
                      ? `/workspaces/${response.sourceWorkspaceId}?thread=${chain
                          .map((s) => s.id)
                          .join(",")}`
                      : `/workspaces/${response.sourceWorkspaceId}`
                    : null;

                return (
                  <div className="mt-1 space-y-1.5 text-[11px] text-fg-subtle">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {hasNestedChain ? (
                        <button
                          type="button"
                          onClick={() => setChainExpanded((v) => !v)}
                          aria-expanded={chainExpanded}
                          data-testid="promoted-chain-toggle"
                          className="inline-flex items-center gap-1 font-medium text-fg hover:text-accent cursor-pointer"
                        >
                          {chainExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <span>{t("promoted.fromSideQuestion")}</span>
                          {level !== null && (
                            <span
                              className="rounded bg-surface-2 px-1 py-0.2 text-[10px] font-semibold text-fg-muted"
                              data-testid="promoted-depth-badge"
                            >
                              {t("promoted.level", { level })}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span>
                          {t("promoted.fromPassage")}
                          {level !== null
                            ? ` · ${t("promoted.level", { level })}`
                            : ""}
                        </span>
                      )}

                      {response.sourceRemoved ? (
                        <span
                          className="text-muted font-medium"
                          data-testid="source-removed-badge"
                        >
                          {t("promoted.sourceRemoved")}
                        </span>
                      ) : crossThreadHref && response.sourceAccessible ? (
                        <Link
                          href={crossThreadHref}
                          className="text-accent hover:underline font-medium"
                        >
                          {t("promoted.viewAnnotation")}
                        </Link>
                      ) : (
                        response.sourceAnnotationId &&
                        response.sourceAccessible !== false && (
                          <button
                            type="button"
                            onClick={() => {
                              if (response.sourceAnnotationId) {
                                void openAnnotationThread(response.sourceAnnotationId);
                              }
                            }}
                            className="text-accent hover:underline font-medium cursor-pointer"
                          >
                            {t("promoted.viewAnnotation")}
                          </button>
                        )
                      )}
                    </div>

                    {hasNestedChain && chainExpanded && chain && (
                      <div
                        data-testid="promoted-chain"
                        className="flex flex-wrap items-center gap-1 rounded bg-surface-2/80 px-2 py-1 text-[11px] text-fg-muted"
                      >
                        {chain.map((step, i) => (
                          <React.Fragment key={step.id}>
                            {i > 0 && <span aria-hidden="true">›</span>}
                            <span className="truncate max-w-[14rem]" title={step.quote}>
                              “{step.quote}”
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          {response.attachments && response.attachments.length > 0 && (
            <div
              className="mb-2.5 flex flex-wrap gap-2"
              data-testid="prompt-attachments"
            >
              {response.attachments.map((att) => (
                <PromptAttachmentPreview key={att.id} attachment={att} />
              ))}
            </div>
          )}
          <div
            className={cn(
              "leading-relaxed whitespace-pre-wrap select-text",
              isFirstPrompt && "vt-first-prompt",
              !isPromptExpanded && isPromptLong && "line-clamp-6"
            )}
          >
            {response.prompt}
          </div>
          {isPromptLong && (
            <button
              type="button"
              onClick={() => setIsPromptExpanded(!isPromptExpanded)}
              className="text-accent mt-1 flex cursor-pointer items-center gap-1 text-xs font-medium hover:underline"
            >
              {isPromptExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>{t("collapsePrompt")}</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>{t("expandPrompt")}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 2. Assistant Answer Card */}
      <div className="flex gap-3 text-left">
        {/* Left Author / Brand Avatar */}
        <div className="shrink-0 pt-0.5">
          {memberCount > 1 && response.author ? (
            <Avatar className="border-border h-8 w-8 rounded-xl border" title={response.author.name}>
              {response.author.avatarUrl ? (
                <AvatarImage src={response.author.avatarUrl} alt={response.author.name || "User"} />
              ) : null}
              <AvatarFallback className="bg-surface-2 text-xs font-medium">
                {response.author.name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="bg-accent-soft text-accent border-border flex h-8 w-8 items-center justify-center rounded-xl border shadow-2xs">
              <Sparkles className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Main Response Box */}
        <div className="border-border text-fg min-w-0 flex-1 space-y-3.5 rounded-2xl p-4 text-sm shadow-2xs sm:p-5 sm:text-base">
          {/* Card Header: Badges & Version Switcher */}
          <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Model Badge */}
              <Badge
                variant="outline"
                className="bg-surface-2 text-xs font-medium"
              >
                {modelName}
              </Badge>

              {memberCount > 1 && response.author?.name ? (
                <span className="text-xs text-subtle font-medium">
                  by {response.author.name}
                </span>
              ) : null}

              {response.origin === "PROMOTED" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="bg-accent-soft text-accent border-accent/30 text-xs font-medium cursor-help"
                      data-testid="promoted-badge"
                    >
                      {t("promoted.badge")}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Added {response.createdAt ? new Date(response.createdAt).toLocaleDateString() : ""}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Version Switcher (‹ 2/3 ›) */}
              {versionCount > 1 && (
                <div
                  role="group"
                  tabIndex={0}
                  onKeyDown={handleVersionKeyDown}
                  aria-label={t("versionAria", {
                    current: activeNumber,
                    total: versionCount,
                  })}
                  className="border-border bg-surface-2 text-fg focus:ring-accent flex items-center gap-1 rounded-lg border px-1.5 py-0.5 font-mono text-xs select-none focus:ring-1 focus:outline-hidden"
                >
                  <button
                    type="button"
                    onClick={() => handleSwitchVersion("prev")}
                    disabled={
                      activeNumber <= 1 ||
                      switchVersionMutation.isPending ||
                      versions.length <= 1
                    }
                    aria-label={t("previousVersion")}
                    className="hover:bg-surface cursor-pointer rounded p-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <span className="px-1 text-[11px] font-medium">
                    {t("version", {
                      current: activeNumber,
                      total: versionCount,
                    })}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleSwitchVersion("next")}
                    disabled={
                      activeNumber >= versionCount ||
                      switchVersionMutation.isPending ||
                      versions.length <= 1
                    }
                    aria-label={t("nextVersion")}
                    className="hover:bg-surface cursor-pointer rounded p-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* "Edited" Badge and Toggle */}
              {hasEdits && !isImageResponse && (
                <div className="flex items-center gap-1">
                  <Badge
                    variant="outline"
                    className="bg-accent-soft text-accent border-accent/30 text-[11px] font-medium"
                  >
                    {t("edited")}
                  </Badge>

                  <button
                    type="button"
                    onClick={() =>
                      setViewMode(viewMode === "edited" ? "original" : "edited")
                    }
                    className="text-fg-muted hover:text-fg ml-1 flex cursor-pointer items-center gap-1 text-[11px] font-medium hover:underline"
                  >
                    {viewMode === "edited" ? (
                      <>
                        <History className="h-3 w-3" />
                        <span>{t("viewOriginal")}</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        <span>{t("viewingEdited")}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Quick header action icons */}
            <div className="text-fg-muted flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label={copied ? t("copied") : t("copy")}
                className="text-fg-muted hover:text-fg h-7 w-7"
              >
                {copied ? (
                  <Check className="text-accent h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Card Body: Text Content, Image, or Inline Editor */}
          {isEditing && !isImageResponse ? (
            <EditResponse
              initialContent={displayedContent}
              onSave={handleSaveEdit}
              onCancel={() => setIsEditing(false)}
              isSaving={createEditMutation.isPending}
            />
          ) : isImageResponse ? (
            <div className="space-y-3">
              {resolvedImageUrl ? (
                <>
                  <div className="group/img border-border bg-surface-2 relative aspect-square max-w-lg overflow-hidden rounded-xl border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedImageUrl}
                      alt={response.prompt}
                      onClick={() => setLightboxOpen(true)}
                      className="h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover/img:scale-[1.02]"
                    />
                    <div className="bg-overlay absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover/img:opacity-100">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setLightboxOpen(true)}
                        className="h-8 text-xs"
                      >
                        <Maximize2 className="mr-1 h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        asChild
                        className="h-8 text-xs"
                      >
                        <a
                          href={resolvedImageUrl}
                          download={`klecx-${response.id}-v${activeNumber}.png`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          {t("downloadImage")}
                        </a>
                      </Button>
                    </div>
                  </div>

                  {/* Lightbox Dialog */}
                  <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                    <DialogContent className="bg-bg/95 max-w-4xl p-3 backdrop-blur-md">
                      <DialogHeader className="flex flex-row items-center justify-between pr-6">
                        <DialogTitle className="text-fg truncate text-sm font-medium">
                          {response.prompt}
                        </DialogTitle>
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="h-7 shrink-0 text-xs"
                        >
                          <a
                            href={resolvedImageUrl}
                            download={`klecx-${response.id}-v${activeNumber}.png`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            {t("downloadImage")}
                          </a>
                        </Button>
                      </DialogHeader>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolvedImageUrl}
                        alt={response.prompt}
                        className="h-auto max-h-[82vh] w-full rounded-lg object-contain"
                      />
                    </DialogContent>
                  </Dialog>
                </>
              ) : imageAttachmentId ? (
                <div
                  data-testid="image-generation-skeleton"
                  className="border-border bg-surface-2 relative flex aspect-square max-w-lg animate-pulse flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border p-6 text-center"
                >
                  <ImageIcon className="text-fg-muted/60 h-10 w-10" />
                  <span className="text-fg-muted text-xs font-medium">
                    Loading image...
                  </span>
                </div>
              ) : (
                <div
                  data-testid="image-generation-failed"
                  className="border-danger/30 bg-danger/5 relative flex max-w-lg flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center"
                >
                  <ImageIcon className="text-danger/70 h-8 w-8" />
                  <span className="text-danger text-xs font-medium">
                    Image generation failed.
                  </span>
                  {onRegenerate && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRegenerate(response.id)}
                      disabled={isRegenerating}
                      className="border-danger/40 text-danger hover:bg-danger/10 h-8 text-xs"
                    >
                      <RotateCcw
                        className={cn(
                          "mr-1.5 h-3.5 w-3.5",
                          isRegenerating && "animate-spin"
                        )}
                      />
                      <span>{t("tryAgain")}</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <AnswerBody
              content={displayedContent}
              thoughtSummary={activeVer?.thoughtSummary}
              citations={activeCitations}
              targetType="RESPONSE_VERSION"
              targetId={activeVer?.id || response.activeVersionId || undefined}
              depth={0}
              workspaceId={workspaceId}
              responseId={response.id}
              quickFix={quickFix}
              unsaved={showsDraft}
              contentSource={viewMode === "original" ? "ORIGINAL" : (hasEdits ? "EDIT" : "ORIGINAL")}
              editRevision={
                viewMode === "edited" && (activeVer?.latestEdit as { revision?: number } | null)?.revision !== undefined
                  ? (activeVer?.latestEdit as { revision?: number } | null)?.revision
                  : undefined
              }
            >
              {response.generatedDocuments &&
                response.generatedDocuments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {response.generatedDocuments.map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/v1/attachments/${doc.id}/download`}
                        download={doc.originalName}
                        className="border-border bg-surface-2 hover:bg-surface text-fg inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors"
                      >
                        <FileDown className="text-accent h-4 w-4 shrink-0" />
                        <span className="max-w-[220px] truncate">
                          {doc.originalName}
                        </span>
                        <span className="text-accent ml-1 underline">
                          Download
                        </span>
                      </a>
                    ))}
                  </div>
                )}
            </AnswerBody>
          )}

          {activeVer?.documents && activeVer.documents.length > 0 && (
            <div className="flex flex-col gap-2 pt-2" data-testid="generated-documents-container">
              {activeVer.documents.map((doc) => (
                <GeneratedDocumentCard
                  key={doc.id}
                  document={doc}
                  workspaceId={workspaceId}
                />
              ))}
            </div>
          )}

          {reviewVersionId && <DocumentReviewProgress versionId={reviewVersionId} />}

          {showsDraft && draft && canEdit && !isEditing && (
            <DocumentDraftBar
              versionId={reviewVersionId}
              workspaceId={workspaceId}
              userId={userId}
              savedContent={editedText}
              draft={draft}
            />
          )}

          {/* Card Footer Actions (Desktop & Mobile) */}
          {!isEditing && (
            <TooltipProvider delayDuration={200}>
              <div className="border-border/50 text-fg-muted flex items-center justify-between border-t pt-2 text-xs">
                {/* Primary Actions */}
                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                  {/* Copy */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="text-fg-muted hover:text-fg h-8 px-2.5 text-xs"
                  >
                    {copied ? (
                      <Check className="text-accent mr-1 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5" />
                    )}
                    <span>{copied ? t("copied") : t("copy")}</span>
                  </Button>

                  {/* Regenerate */}
                  {onRegenerate && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRegenerate(response.id)}
                      disabled={isRegenerating}
                      className="text-fg-muted hover:text-fg h-8 px-2.5 text-xs"
                    >
                      <RotateCcw
                        className={cn(
                          "mr-1 h-3.5 w-3.5",
                          isRegenerating && "animate-spin"
                        )}
                      />
                      <span>{t("regenerate")}</span>
                    </Button>
                  )}

                  {/* Edit (Text responses only) */}
                  {!isImageResponse && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="text-fg-muted hover:text-fg h-8 px-2.5 text-xs"
                    >
                      <Edit2 className="mr-1 h-3.5 w-3.5" />
                      <span>{t("edit")}</span>
                    </Button>
                  )}

                  {/* Download (Image responses direct footer action) */}
                  {isImageResponse && resolvedImageUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      asChild
                      className="text-fg-muted hover:text-fg h-8 px-2.5 text-xs"
                    >
                      <a
                        href={resolvedImageUrl}
                        download={`klecx-${response.id}-v${activeNumber}.png`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        <span>{t("downloadImage")}</span>
                      </a>
                    </Button>
                  )}

                  {/* Read Aloud (Step 9.4 placeholder with tooltip) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled
                        className="text-fg-muted/50 hidden h-8 cursor-not-allowed px-2 text-xs sm:inline-flex"
                      >
                        <Volume2 className="mr-1 h-3.5 w-3.5" />
                        <span>{t("readAloud")}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t("readAloudSoon")}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Share (Step 7.6) */}
                  {canShare ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShareDialogOpen(true)}
                      className="text-fg-muted hover:text-fg hidden h-8 px-2.5 text-xs md:inline-flex"
                    >
                      <Share2 className="mr-1 h-3.5 w-3.5" />
                      <span>{t("share")}</span>
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* span wrapper so the tooltip still fires on a disabled button */}
                        <span className="hidden md:inline-flex" tabIndex={0}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled
                            className="text-fg-muted/50 h-8 cursor-not-allowed px-2 text-xs"
                          >
                            <Share2 className="mr-1 h-3.5 w-3.5" />
                            <span>{t("share")}</span>
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">{t("shareNoPermission")}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Export (Step 5.6: Markdown, PDF, DOCX) */}
                  {!isImageResponse && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-fg-muted hover:text-fg h-8 px-2.5 text-xs"
                        >
                          <FileDown className="mr-1 h-3.5 w-3.5" />
                          <span>{t("export")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-44">
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <a
                            href={`/api/v1/responses/${response.id}/export?format=md&view=${viewMode}`}
                            download
                          >
                            <span>Markdown (.md)</span>
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <a
                            href={`/api/v1/responses/${response.id}/export?format=pdf&view=${viewMode}`}
                            download
                          >
                            <span>PDF (.pdf)</span>
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <a
                            href={`/api/v1/responses/${response.id}/export?format=docx&view=${viewMode}`}
                            download
                          >
                            <span>Word (.docx)</span>
                          </a>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  {false && (
                  <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled
                        className="text-fg-muted/50 hidden h-8 cursor-not-allowed px-2 text-xs md:inline-flex"
                      >
                        <FileDown className="mr-1 h-3.5 w-3.5" />
                        <span>{t("export")}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t("exportSoon")}</p>
                    </TooltipContent>
                  </Tooltip>
                  </>
                  )}
                  <Tooltip>
                    <TooltipContent side="top">
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* More Options Dropdown (⋯) */}
                <div className="flex items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-fg-muted hover:text-fg h-8 w-8"
                        aria-label={t("moreOptions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={handleCopyLink}
                        className="cursor-pointer"
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        <span>{t("copyLink")}</span>
                      </DropdownMenuItem>

                      {!isImageResponse && (
                        <DropdownMenuItem
                          onClick={() => setReviewOpen(true)}
                          className="cursor-pointer"
                          data-testid="menu-ask-klecx-review"
                        >
                          <Sparkles className="mr-2 h-4 w-4 text-accent" />
                          <span>{tReview("askKlecxReview")}</span>
                        </DropdownMenuItem>
                      )}

                      {onDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(response.id)}
                            className="text-danger focus:text-danger focus:bg-danger/10 cursor-pointer"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>{t("delete")}</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
      {shareDialogOpen && canShare && (
        <ShareAndPeopleDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          workspaceId={workspaceId}
          workspaceTitle={workspace?.title || currentPageTitle || "Workspace"}
          currentUserId={userId}
          initialTab="public"
          initialScope="RESPONSE"
          initialResponseId={response.id}
          initialResponsePrompt={response.prompt}
        />
      )}
      {!isImageResponse && reviewVersionId && (
        <DocumentReview
          mode="dialog"
          versionId={reviewVersionId}
          responseId={response.id}
          canAsk={canAsk}
          hasDraft={Boolean(draft)}
          hasMembers={memberCount > 1}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
        />
      )}
    </div>
  );
}
