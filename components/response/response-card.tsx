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
import { EditResponse } from "./edit-response";
import {
  useResponseVersions,
  useSwitchActiveVersion,
  useCreateResponseEdit,
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
  const [viewMode, setViewMode] = React.useState<"edited" | "original">("edited");
  const [copied, setCopied] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = React.useState(false);

  // Queries & Mutations
  const { data: versionsData, isLoading: isLoadingVersions } = useResponseVersions(
    userId,
    response.id
  );
  const switchVersionMutation = useSwitchActiveVersion(userId, workspaceId);
  const createEditMutation = useCreateResponseEdit(userId, workspaceId);

  const versions = versionsData?.versions || [];
  const versionCount = response.versionCount || versions.length || 1;

  // Active version details
  const activeVer = response.activeVersion;
  const activeVersionId = response.activeVersionId || activeVer?.id;
  const activeNumber =
    activeVer?.number ||
    (versions.findIndex((v) => v.id === activeVersionId) + 1) ||
    1;

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
      (activeVer?.latestEditContent && activeVer.latestEditContent !== originalText)
  );

  const editedText = activeVer?.latestEditContent || activeVer?.content || originalText;
  const displayedContent = hasEdits && viewMode === "original" ? originalText : editedText;

  // Prompt truncation helper (> 6 lines or > 300 chars)
  const isPromptLong =
    response.prompt.length > 300 || response.prompt.split("\n").length > 6;

  // Model key formatting
  const modelKey = activeVer?.modelKey || "text-economy";
  const modelName =
    modelKey.includes("pro")
      ? t("modelPro")
      : modelKey.includes("economy")
      ? t("modelEconomy")
      : t("modelStandard");

  // Version navigation
  const handleSwitchVersion = (direction: "prev" | "next") => {
    if (versions.length === 0) return;
    const currentIdx = versions.findIndex(
      (v) => v.id === (activeVersionId || activeVer?.id)
    );
    let targetIdx = currentIdx;
    if (direction === "prev" && currentIdx > 0) {
      targetIdx = currentIdx - 1;
    } else if (direction === "next" && currentIdx < versions.length - 1) {
      targetIdx = currentIdx + 1;
    }

    const targetVersion = versions[targetIdx];
    if (targetIdx !== currentIdx && targetVersion) {
      switchVersionMutation.mutate({
        responseId: response.id,
        input: { versionId: targetVersion.id },
      });
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
    displayedContent.startsWith("http") &&
      (displayedContent.includes("cloudinary") ||
        displayedContent.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i) !== null);

  return (
    <div
      id={`response-${response.id}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 180px" }}
      className={cn("space-y-4 group", className)}
    >
      {/* 1. User Prompt Bubble */}
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-2xl rounded-2xl bg-surface-2 border border-border px-4 py-2.5 text-sm sm:text-base text-fg shadow-2xs",
            isFirstPrompt && "vt-first-prompt"
          )}
        >
          <div
            className={cn(
              "whitespace-pre-wrap leading-relaxed select-text",
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
              className="mt-1 flex items-center gap-1 text-xs font-medium text-accent hover:underline cursor-pointer"
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
            <Avatar className="h-8 w-8 rounded-xl border border-border">
              <AvatarFallback className="text-xs bg-surface-2 font-medium">
                {response.author.name?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-8 w-8 rounded-xl bg-accent-soft text-accent flex items-center justify-center border border-border shadow-2xs">
              <Sparkles className="h-4 w-4" />
            </div>
          )}
        </div>

        {/* Main Response Box */}
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 text-sm sm:text-base text-fg shadow-2xs space-y-3.5">
          {/* Card Header: Badges & Version Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Model Badge */}
              <Badge variant="outline" className="text-xs font-medium bg-surface-2">
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
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-border bg-surface-2 text-xs font-mono text-fg select-none focus:outline-hidden focus:ring-1 focus:ring-accent"
                >
                  <button
                    type="button"
                    onClick={() => handleSwitchVersion("prev")}
                    disabled={activeNumber <= 1 || switchVersionMutation.isPending}
                    aria-label={t("previousVersion")}
                    className="p-0.5 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>

                  <span className="px-1 text-[11px] font-medium">
                    {t("version", { current: activeNumber, total: versionCount })}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleSwitchVersion("next")}
                    disabled={
                      activeNumber >= versionCount || switchVersionMutation.isPending
                    }
                    aria-label={t("nextVersion")}
                    className="p-0.5 rounded hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
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
                    className="text-[11px] bg-accent-soft text-accent border-accent/30 font-medium"
                  >
                    {t("edited")}
                  </Badge>

                  <button
                    type="button"
                    onClick={() =>
                      setViewMode(viewMode === "edited" ? "original" : "edited")
                    }
                    className="text-[11px] font-medium text-fg-muted hover:text-fg hover:underline cursor-pointer flex items-center gap-1 ml-1"
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
            <div className="flex items-center gap-1 text-fg-muted">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label={copied ? t("copied") : t("copy")}
                className="h-7 w-7 text-fg-muted hover:text-fg"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
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
              <div className="relative group/img overflow-hidden rounded-xl border border-border bg-surface-2 max-w-lg aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayedContent}
                  alt={response.prompt}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-overlay opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setLightboxOpen(true)}
                    className="text-xs h-8"
                  >
                    <Maximize2 className="h-3.5 w-3.5 mr-1" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    asChild
                    className="text-xs h-8"
                  >
                    <a href={displayedContent} download={`klecx-${response.id}.png`}>
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {t("downloadImage" as any) || "Download"}
                    </a>
                  </Button>
                </div>
              </div>

              {/* Lightbox Dialog */}
              <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
                <DialogContent className="max-w-4xl p-2 bg-bg/95 backdrop-blur-md">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{response.prompt}</DialogTitle>
                  </DialogHeader>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayedContent}
                    alt={response.prompt}
                    className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
                  />
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="leading-relaxed select-text overflow-x-auto whitespace-pre-wrap break-words">
              {displayedContent}
            </div>
          )}

          {/* Card Footer Actions (Desktop & Mobile) */}
          {!isEditing && (
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-fg-muted">
                {/* Primary Actions */}
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                  {/* Copy */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-8 px-2.5 text-xs text-fg-muted hover:text-fg"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 mr-1 text-accent" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
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
                      className="h-8 px-2.5 text-xs text-fg-muted hover:text-fg"
                    >
                      <RotateCcw
                        className={cn("h-3.5 w-3.5 mr-1", isRegenerating && "animate-spin")}
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
                    className="h-8 px-2.5 text-xs text-fg-muted hover:text-fg"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
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
                        className="h-8 px-2 text-xs text-fg-muted/50 hidden sm:inline-flex cursor-not-allowed"
                      >
                        <Volume2 className="h-3.5 w-3.5 mr-1" />
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
                        className="h-8 px-2 text-xs text-fg-muted/50 hidden md:inline-flex cursor-not-allowed"
                      >
                        <Share2 className="h-3.5 w-3.5 mr-1" />
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
                        className="h-8 px-2 text-xs text-fg-muted/50 hidden md:inline-flex cursor-not-allowed"
                      >
                        <FileDown className="h-3.5 w-3.5 mr-1" />
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
                        className="h-8 w-8 text-fg-muted hover:text-fg"
                        aria-label={t("moreOptions")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                        <LinkIcon className="h-4 w-4 mr-2" />
                        <span>{t("copyLink")}</span>
                      </DropdownMenuItem>

                      {onDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(response.id)}
                            className="cursor-pointer text-danger focus:text-danger focus:bg-danger/10"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
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
