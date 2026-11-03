"use client";

import * as React from "react";
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
  FileText,
  MoreHorizontal,
  Sparkles,
  Download,
  Maximize2,
  Trash2,
  Link as LinkIcon,
  Eye,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ThinkingPanel } from "./thinking-panel";
import { PromptAttachmentPreview } from "./prompt-attachment-preview";
import { EditResponse } from "./edit-response";
import { Markdown } from "@/components/markdown";
import {
  useResponseVersions,
  useSwitchActiveVersion,
  useCreateResponseEdit,
  type ResponseVersionDto,
} from "@/lib/api/hooks/responses";

export interface ResponseItemData {
  id: string;
  workspaceId: string;
  prompt: string;
  kind?: "TEXT" | "IMAGE" | string;
  response?: string;
  content?: string;
  versionCount?: number;
  activeVersionId?: string | null;
  createdAt?: string | Date;
  activeVersion?: {
    id: string;
    number: number;
    content: string;
    originalContent?: string;
    thoughtSummary?: string | null;
    modelKey?: string | null;
    edited?: boolean;
    hasEdits?: boolean;
    latestEdit?: { content?: string } | null;
    latestEditContent?: string | null;
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
}

export interface ResponseCardProps {
  response: ResponseItemData;
  workspaceId: string;
  userId: string;
  memberCount?: number;
  onRegenerate?: (responseId: string) => void;
  onDelete?: (responseId: string) => void;
  isRegenerating?: boolean;
  isFirstPrompt?: boolean;
  className?: string;
}

export function ResponseCard({
  response,
  workspaceId,
  userId,
  memberCount = 1,
  onRegenerate,
  onDelete,
  isRegenerating = false,
  isFirstPrompt = false,
  className,
}: ResponseCardProps) {
  const t = useTranslations("Response");
  const [isEditing, setIsEditing] = React.useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"edited" | "original">(
    "edited"
  );
  const [copied, setCopied] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = React.useState(false);

  // Queries & Mutations
  const { data: versionsData, isLoading: isLoadingVersions } =
    useResponseVersions(userId, response.id);
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
  const displayedContent =
    hasEdits && viewMode === "original" ? originalText : editedText;

  // Prompt truncation helper (> 6 lines or > 300 chars)
  const isPromptLong =
    response.prompt.length > 300 || response.prompt.split("\n").length > 6;

  // Model key formatting
  const modelKey = activeVer?.modelKey || "text-economy";
  const modelName = modelKey.includes("pro")
    ? t("modelPro")
    : modelKey.includes("economy")
      ? t("modelEconomy")
      : t("modelStandard");

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
      await navigator.clipboard.writeText(displayedContent);
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
    await createEditMutation.mutateAsync({
      responseId: response.id,
      input: { content: newContent },
    });
    setViewMode("edited");
    setIsEditing(false);
  };

  const isImageResponse =
    response.kind === "IMAGE" ||
    (displayedContent.startsWith("http") &&
      (displayedContent.includes("cloudinary") ||
        displayedContent.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null));




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
            <Avatar className="border-border h-8 w-8 rounded-xl border">
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
              {hasEdits && (
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

          {/* Thinking Panel (if summary present) */}
          {activeVer?.thoughtSummary && !isEditing && (
            <ThinkingPanel thoughtSummary={activeVer.thoughtSummary} />
          )}

          {/* Card Body: Text Content, Image, or Inline Editor */}
          {isEditing ? (
            <EditResponse
              initialContent={displayedContent}
              onSave={handleSaveEdit}
              onCancel={() => setIsEditing(false)}
              isSaving={createEditMutation.isPending}
            />
          ) : isImageResponse ? (
            <div className="space-y-3">
              <div className="group/img border-border bg-surface-2 relative aspect-square max-w-lg overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayedContent}
                  alt={response.prompt}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02]"
                />
                <div className="bg-overlay absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover/img:opacity-100">
                  <Button
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
                      href={displayedContent}
                      download={`klecx-${response.id}.png`}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {t("downloadImage" as any) || "Download"}
                    </a>
                  </Button>
                </div>
              </div>

              {/* Lightbox Dialog */}
              <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                <DialogContent className="bg-bg/95 max-w-4xl p-2 backdrop-blur-md">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{response.prompt}</DialogTitle>
                  </DialogHeader>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayedContent}
                    alt={response.prompt}
                    className="h-auto max-h-[85vh] w-full rounded-lg object-contain"
                  />
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="leading-relaxed select-text">
              <Markdown content={displayedContent} />
            </div>
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

                  {/* Edit */}
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

                  {/* Share (Step 7.6 placeholder) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled
                        className="text-fg-muted/50 hidden h-8 cursor-not-allowed px-2 text-xs md:inline-flex"
                      >
                        <Share2 className="mr-1 h-3.5 w-3.5" />
                        <span>{t("share")}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t("shareSoon")}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Export (Step 5.6 placeholder) */}
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
    </div>
  );
}
