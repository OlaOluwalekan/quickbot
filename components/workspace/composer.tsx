"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  AlertCircle,
  Brain,
  ChevronDown,
  Globe,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Paperclip,
  FileText,
  X,
  Check,
  Loader2,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryClientContext } from "@tanstack/react-query";
import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import { api } from "@/lib/api/client";
import { uploadAttachment } from "@/lib/api/attachments";
import { navigateWithTransition } from "@/lib/navigation/view-transition";
import { CLIENT_MODELS, type ClientModelOption } from "@/lib/ai/client-models";
import { AI_LANGUAGES, type AiLanguage } from "@/lib/locale";
import type { WorkspaceDto } from "@/lib/api/hooks/workspaces";
import { useEntitlements } from "@/lib/api/hooks/entitlements";
import { QuestionQueuePopover } from "@/components/workspace/question-queue-popover";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MAX_PROMPT_LENGTH = 20_000;
const COUNTER_THRESHOLD = 18_000; // 90% of max

function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "idem-" + Math.random().toString(36).substring(2, 15);
}

export interface ComposerProps {
  initialPrompt?: string;
  initialMode?: "text" | "image";
  placeholder?: string;
  size?: "large" | "compact";
  className?: string;
  workspaceId?: string | null;
  autoFocus?: boolean;
  onSubmitted?: () => void;
  onStop?: () => void;
  credits?: { plan: string; balance: number };
}

export interface ComposerAttachment {
  id: string;
  attachmentId?: string;
  file: File;
  name: string;
  size: number;
  mime: string;
  kind: "IMAGE" | "DOCUMENT";
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
}

export function Composer({
  initialPrompt = "",
  initialMode,
  placeholder,
  size = "large",
  className,
  workspaceId = null,
  autoFocus = false,
  onSubmitted,
  onStop,
  credits,
}: ComposerProps) {
  const t = useTranslations("Chat");
  const tHome = useTranslations("Home");
  const router = useRouter();
  const queryClient = React.useContext(QueryClientContext);
  const targetWorkspaceIdRef = React.useRef<string | null>(null);

  const draftKey = workspaceId || "__home__";

  const storeChatMode = useUiStore((s) => s.chatMode);
  const setStoreChatMode = useUiStore((s) => s.setChatMode);
  const composerEnterToSend = useUiStore((s) => s.composerEnterToSend);
  const savedDraft = useUiStore((s) => s.drafts[draftKey]);
  const setDraft = useUiStore((s) => s.setDraft);
  const clearDraft = useUiStore((s) => s.clearDraft);

  // Generation stream status for current workspace
  const currentStream = useGenerationStore((s) =>
    workspaceId ? s.streams[workspaceId] : null,
  );
  const isStreaming = currentStream?.status === "streaming";

  // Composer state
  const [prompt, setPrompt] = React.useState<string>(() => {
    if (initialPrompt) return initialPrompt;
    return savedDraft || "";
  });
  const [mode, setMode] = React.useState<"text" | "image">(
    initialMode || storeChatMode || "text",
  );
  const [selectedModel, setSelectedModel] = React.useState<string>("text-economy");
  const [thinkHarder, setThinkHarder] = React.useState(false);
  const [grounding, setGrounding] = React.useState(false);
  const [selectedLanguage, setSelectedLanguage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [creationError, setCreationError] = React.useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = React.useState("");

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Announce only "Generating..." and "Done" to screen readers (not per-token deltas)
  React.useEffect(() => {
    if (isStreaming) {
      setLiveAnnouncement(t("generatingLive"));
    } else if (currentStream?.status === "completed") {
      setLiveAnnouncement(t("generatingDone"));
    }
  }, [isStreaming, currentStream?.status, t]);

  const adjustHeight = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minH = size === "large" ? 64 : 44;
    // max 40vh
    const maxViewportH = typeof window !== "undefined" ? window.innerHeight * 0.4 : 300;
    const nextH = Math.min(Math.max(el.scrollHeight, minH), maxViewportH);
    el.style.height = `${nextH}px`;
  }, [size]);

  // Sync initialPrompt prop if it changes
  React.useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
      if (textareaRef.current) {
        textareaRef.current.value = initialPrompt;
        adjustHeight();
        // Highlight first {{placeholder}} if present
        const match = /\{\{([^}]+)\}\}/.exec(initialPrompt);
        if (match && match.index !== undefined) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            match.index,
            match.index + match[0].length,
          );
        }
      }
    }
  }, [initialPrompt, adjustHeight]);

  // Auto-focus support
  React.useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Debounced draft persistence per workspace
  const handlePromptChange = (val: string) => {
    setPrompt(val);
    setCreationError(null);
    adjustHeight();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDraft(draftKey, val);
    }, 300);
  };

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleModeChange = (nextMode: "text" | "image") => {
    setMode(nextMode);
    setStoreChatMode(nextMode);
  };

  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { entitlements } = useEntitlements();
  const MAX_ATTACHMENTS = entitlements.limits.attachmentsPerWorkspace;
  const MAX_FILE_SIZE = entitlements.limits.maxFileMB * 1024 * 1024;

  const uploadItem = React.useCallback(async (item: ComposerAttachment) => {
    try {
      let targetWsId = workspaceId || targetWorkspaceIdRef.current;
      if (!targetWsId) {
        const newWs = await api<WorkspaceDto>("/api/v1/workspaces", {
          method: "POST",
          body: { title: "New workspace" },
        });
        targetWsId = newWs.id;
        targetWorkspaceIdRef.current = newWs.id;
        queryClient?.invalidateQueries({ queryKey: ["workspaces"] });
      }

      const attId = await uploadAttachment(item.file, targetWsId, (pct) => {
        setAttachments((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, progress: pct } : a))
        );
      });

      setAttachments((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? { ...a, status: "ready", progress: 100, attachmentId: attId }
            : a
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === item.id ? { ...a, status: "error", error: msg } : a
        )
      );
    }
  }, [workspaceId, queryClient]);

  const handleFiles = React.useCallback((files: File[]) => {
    if (files.length === 0) return;
    setCreationError(null);

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setCreationError(t("attachLimitReached"));
      return;
    }

    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        setCreationError(t("attachSizeExceeded"));
        return;
      }
    }

    const newItems: ComposerAttachment[] = files.map((f) => {
      const isImg =
        f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
      return {
        id: "att-" + Math.random().toString(36).substring(2, 9),
        file: f,
        name: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
        kind: isImg ? "IMAGE" : "DOCUMENT",
        previewUrl: isImg ? URL.createObjectURL(f) : undefined,
        status: "uploading",
        progress: 0,
      };
    });

    setAttachments((prev) => [...prev, ...newItems]);
    for (const item of newItems) {
      uploadItem(item);
    }
  }, [attachments.length, MAX_ATTACHMENTS, MAX_FILE_SIZE, t, uploadItem]);

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const retryAttachment = React.useCallback((id: string) => {
    const item = attachments.find((a) => a.id === id);
    if (!item) return;
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: "uploading", progress: 0, error: undefined } : a
      )
    );
    uploadItem(item);
  }, [attachments, uploadItem]);

  const isOutOfCredits = Boolean(credits && credits.balance <= 0);

  const handleSubmit = async () => {
    const cleanPrompt = prompt.trim();
    const isUploadingAny = attachments.some((a) => a.status === "uploading");
    if (!cleanPrompt || isSubmitting || isStreaming || isOutOfCredits || isUploadingAny) return;
    const readyAttachmentIds = attachments
      .filter((a) => a.status === "ready" && a.attachmentId)
      .map((a) => a.attachmentId!);

    if (mode === "image" && (attachments.length > 0 || readyAttachmentIds.length > 0)) {
      setCreationError("Image generation cannot be combined with file or image attachments.");
      return;
    }

    const effectiveModelKey = mode === "image" ? "image-standard" : selectedModel;
    const effectiveKind = mode === "image" ? "IMAGE" : "TEXT";
    const effectiveGrounding = mode === "text" && grounding ? true : undefined;

    setIsSubmitting(true);
    setCreationError(null);

    // If already inside an existing workspace
    if (workspaceId) {
      clearDraft(draftKey);
      setPrompt("");
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.value = "";
        textareaRef.current.style.height = size === "large" ? "64px" : "44px";
      }

      try {
        const idempotencyKey = safeRandomUUID();
        useGenerationStore.getState().startStream(workspaceId, {
          prompt: cleanPrompt,
          kind: effectiveKind,
        });

        const { streamGeneration } = await import("@/lib/api/sse");
        await streamGeneration(
          workspaceId,
          {
            idempotencyKey,
            prompt: cleanPrompt,
            modelKey: effectiveModelKey,
            kind: effectiveKind,
            think: thinkHarder,
            grounding: effectiveGrounding,
            language: selectedLanguage || undefined,
            attachmentIds: readyAttachmentIds.length > 0 ? readyAttachmentIds : undefined,
          },
          {
            onStarted: (data) => {
              useGenerationStore.getState().setGenerationId(workspaceId, data.generationId);
            },
            onStatus: (data) => {
              useGenerationStore.getState().setProgress(workspaceId, data.stage);
            },
            onThought: (data) => {
              useGenerationStore.getState().appendThought(workspaceId, data.text);
            },
            onDelta: (data) => {
              useGenerationStore.getState().appendDelta(workspaceId, data.text);
            },
            onCitation: (data) => {
              useGenerationStore.getState().appendCitation(workspaceId, data);
            },
            onCompleted: (data) => {
              useGenerationStore.getState().completeStream(workspaceId, data.content, data.citations);
            },
            onError: (err) => {
              useGenerationStore.getState().failStream(workspaceId, err.message || err.code);
            },
          },
        );
        onSubmitted?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Generation failed";
        useGenerationStore.getState().failStream(workspaceId, msg);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // HOME PAGE: Blank -> Workspace smooth transition
    try {
      const idempotencyKey = safeRandomUUID();
      const titleCandidate =
        cleanPrompt.slice(0, 60).replace(/["'\n\r]/g, "").trim() || "New workspace";

      // 1. Check if workspace was already created by an earlier attachment upload
      const existingBlankWsId = targetWorkspaceIdRef.current;
      let targetId: string;

      if (existingBlankWsId) {
        targetId = existingBlankWsId;
        // Asynchronously update title to match prompt
        api(`/api/v1/workspaces/${existingBlankWsId}`, {
          method: "PATCH",
          body: { title: titleCandidate },
        }).catch(() => {});
      } else {
        const newWs = await api<WorkspaceDto>("/api/v1/workspaces", {
          method: "POST",
          body: { title: titleCandidate },
        });
        targetId = newWs.id;
      }

      // 2. Store pendingStart in generation store
      useGenerationStore.getState().setPendingStart({
        workspaceId: targetId,
        prompt: cleanPrompt,
        modelKey: effectiveModelKey,
        idempotencyKey,
        mode,
        thinkHarder,
        grounding: effectiveGrounding,
        language: selectedLanguage,
        attachmentIds: readyAttachmentIds.length > 0 ? readyAttachmentIds : undefined,
      });

      // Clear draft on successful transition launch
      clearDraft(draftKey);
      setAttachments([]);
      targetWorkspaceIdRef.current = null;
      queryClient?.invalidateQueries({ queryKey: ["workspaces"] });

      // 3. Navigate inside a View Transition
      navigateWithTransition(router, `/workspaces/${targetId}`);
      onSubmitted?.();
    } catch (err: unknown) {
      console.error("[Composer] Failed to create workspace:", err);
      // Keep prompt text in composer, show retry inline
      setCreationError(t("createWorkspaceFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = () => {
    if (workspaceId) {
      useGenerationStore.getState().cancelStream(workspaceId);
      onStop?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME safety: do not fire on composition end or during CJK IME input
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter") {
      if (composerEnterToSend && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (!composerEnterToSend && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const isLarge = size === "large";
  const defaultPlaceholder =
    mode === "image"
      ? tHome("composerImagePlaceholder")
      : tHome("composerPlaceholder");

  const showCharCounter = prompt.length >= COUNTER_THRESHOLD;
  const activeModel =
    CLIENT_MODELS.find((m) => m.key === selectedModel) || CLIENT_MODELS[0]!;

  return (
    <form
      role="region"
      aria-label="Composer"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          handleFiles(files);
        }
      }}
      className={cn(
        "vt-composer relative flex flex-col rounded-2xl sm:rounded-3xl border border-border bg-surface shadow-md transition-all focus-within:border-accent/80 focus-within:ring-2 focus-within:ring-ring/40",
        isLarge ? "p-3 sm:p-4" : "p-2 sm:p-3",
        creationError && "border-danger ring-1 ring-danger/40",
        className,
      )}
    >
      {isDragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl sm:rounded-3xl border-2 border-dashed border-accent bg-surface/90 backdrop-blur-xs">
          <div className="flex items-center gap-2 text-sm font-medium text-accent">
            <Paperclip className="h-5 w-5" />
            <span>{t("dropFilesHere")}</span>
          </div>
        </div>
      )}

      {/* Live Region: screen reader announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Out of Credits Alert */}
      {isOutOfCredits && (
        <div
          id="credits-warning"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-warning/10 border border-warning/20 px-3 py-1.5 text-xs text-warning"
        >
          <span>{t("outOfCreditsReason")}</span>
          <Link
            href="/settings"
            className="font-semibold underline hover:text-fg transition-colors"
          >
            {t("upgradeCta")}
          </Link>
        </div>
      )}

      {/* Creation Error Retry Alert */}
      {creationError && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-1.5 text-xs text-danger"
        >
          <span>{creationError}</span>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center gap-1 font-semibold underline hover:opacity-80 transition-opacity cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t("retry")}</span>
          </button>
        </div>
      )}

      {/* Attachment Chips */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1" data-testid="composer-attachments">
          {attachments.map((att) => (
            <div
              key={att.id}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Backspace" || e.key === "Delete") {
                  e.preventDefault();
                  removeAttachment(att.id);
                }
              }}
              className={cn(
                "bg-surface-2 border-border/70 text-fg relative flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs shadow-2xs transition-all",
                att.status === "error" && "border-danger/50 bg-danger/10 text-danger"
              )}
            >
              {att.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="size-5 rounded object-cover"
                />
              ) : att.kind === "IMAGE" ? (
                <ImageIcon className="size-4 text-accent" />
              ) : (
                <FileText className="size-4 text-muted" />
              )}
              <span className="max-w-[120px] truncate font-medium">{att.name}</span>
              <span className="text-[10px] text-muted">
                ({Math.max(1, Math.round(att.size / 1024))} KB)
              </span>

              {att.status === "uploading" && (
                <div className="flex items-center gap-1 text-[10px] text-accent">
                  <Loader2 className="size-3 animate-spin" />
                  <span>{att.progress}%</span>
                </div>
              )}
              {att.status === "ready" && (
                <Check className="size-3 text-accent" />
              )}
              {att.status === "error" && (
                <button
                  type="button"
                  onClick={() => retryAttachment(att.id)}
                  title={t("attachRetry")}
                  className="text-danger hover:underline text-[10px] font-medium cursor-pointer"
                >
                  {t("attachRetry")}
                </button>
              )}

              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                aria-label={t("attachRemove")}
                title={t("attachRemove")}
                className="text-muted hover:text-fg rounded p-0.5 transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Error Banner & Plan Guidance */}
      {attachments.some((a) => a.status === "error") && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger mb-2">
          <div className="flex items-start gap-2 font-medium">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {attachments
                .filter((a) => a.status === "error" && a.error)
                .map((a) => (
                  <p key={a.id}>
                    <span className="font-semibold">{a.name}:</span> {a.error}
                  </p>
                ))}
            </div>
          </div>
          {attachments.some(
            (a) =>
              a.error?.toLowerCase().includes("limit") ||
              a.error?.toLowerCase().includes("plan")
          ) && (
            <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-danger/20 pt-2 text-[11px] text-fg-muted">
              <span>Workspace attachment limit reached for this plan.</span>
              <div className="flex items-center gap-2">
                <Link
                  href="/settings/billing"
                  className="font-medium text-accent hover:underline cursor-pointer"
                >
                  Upgrade plan
                </Link>
                <span>•</span>
                <Link
                  href="/workspaces"
                  className="font-medium text-fg hover:underline cursor-pointer"
                >
                  Start a new workspace
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Textarea */}
      <label htmlFor="composer-textarea" className="sr-only">
        {t("welcomeTitle")}
      </label>
      <textarea
        id="composer-textarea"
        ref={textareaRef}
        rows={isLarge ? 2 : 1}
        value={prompt}
        disabled={isSubmitting || isStreaming || isOutOfCredits}
        maxLength={MAX_PROMPT_LENGTH}
        aria-describedby={
          isOutOfCredits
            ? "credits-warning"
            : showCharCounter
              ? "composer-char-count"
              : undefined
        }
        onChange={(e) => handlePromptChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (items) {
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              if (it?.kind === "file") {
                const f = it.getAsFile();
                if (f) files.push(f);
              }
            }
            if (files.length > 0) {
              e.preventDefault();
              handleFiles(files);
            }
          }
        }}
        placeholder={placeholder || defaultPlaceholder}
        className={cn(
          "w-full resize-none bg-transparent text-fg placeholder:text-subtle focus:outline-none leading-relaxed",
          isLarge
            ? "text-sm sm:text-base min-h-[64px]"
            : "text-xs sm:text-sm min-h-[44px]",
        )}
      />

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 mt-1">
        {/* Left Action Group: Mode + Attach + Model + Language + Think harder + Search the web */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Mode Switch (Text / Image) */}
          <div className="flex items-center gap-0.5 rounded-xl bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => handleModeChange("text")}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                mode === "text"
                  ? "bg-surface text-accent shadow-xs"
                  : "text-muted hover:text-fg",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{t("modeText")}</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("image")}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                mode === "image"
                  ? "bg-surface text-accent shadow-xs"
                  : "text-muted hover:text-fg",
              )}
            >
              <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{t("modeImage")}</span>
            </button>
          </div>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={(e) => {
              if (e.target.files) {
                handleFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            aria-hidden="true"
          />

          {/* Attach Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title={t("attachFile")}
            aria-label={t("attachFile")}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>

          {/* Model Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium bg-surface-2 text-fg hover:bg-surface-3 transition-colors cursor-pointer border border-border/50"
              >
                <Sparkles className="h-3 w-3 text-accent" />
                <span className="max-w-[110px] truncate">{activeModel.name}</span>
                <span className="text-[10px] text-muted">({activeModel.creditHint})</span>
                <ChevronDown className="h-3 w-3 text-muted" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1.5 space-y-1">
              <div className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
                {t("model")}
              </div>
              {CLIENT_MODELS.map((m: ClientModelOption) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedModel(m.key)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-left cursor-pointer transition-colors",
                    selectedModel === m.key
                      ? "bg-accent-soft text-accent font-medium"
                      : "hover:bg-surface-2 text-fg",
                  )}
                >
                  <div>
                    <div>{m.name}</div>
                    <div className="text-[10px] text-muted">{m.creditHint}</div>
                  </div>
                  {m.minPlan !== "FREE" && (
                    <span className="text-[9px] font-bold uppercase rounded bg-surface-3 px-1 py-0.5 text-muted">
                      {m.minPlan}
                    </span>
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Language Chip */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("language")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer border border-border/50",
                  selectedLanguage
                    ? "bg-accent-soft text-accent"
                    : "bg-surface-2 text-muted hover:text-fg hover:bg-surface-3",
                )}
              >
                <Globe className="h-3 w-3" />
                <span className="uppercase text-[11px]">
                  {selectedLanguage || t("languageAuto")}
                </span>
                <ChevronDown className="h-2.5 w-2.5 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 max-h-56 overflow-y-auto p-1 space-y-0.5">
              <button
                type="button"
                onClick={() => setSelectedLanguage(null)}
                className={cn(
                  "w-full rounded-md px-2 py-1 text-xs text-left cursor-pointer transition-colors",
                  selectedLanguage === null
                    ? "bg-accent-soft text-accent font-medium"
                    : "hover:bg-surface-2 text-fg",
                )}
              >
                {t("languageAuto")}
              </button>
              {AI_LANGUAGES.map((lang: AiLanguage) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setSelectedLanguage(lang)}
                  className={cn(
                    "w-full rounded-md px-2 py-1 text-xs text-left uppercase cursor-pointer transition-colors",
                    selectedLanguage === lang
                      ? "bg-accent-soft text-accent font-medium"
                      : "hover:bg-surface-2 text-fg",
                  )}
                >
                  {lang}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Think Harder Toggle */}
          <button
            type="button"
            onClick={() => setThinkHarder((prev) => !prev)}
            title={t("thinkHarderDesc")}
            aria-pressed={thinkHarder}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer border",
              thinkHarder
                ? "bg-accent text-accent-fg border-accent shadow-xs"
                : "bg-surface-2 text-muted hover:text-fg hover:bg-surface-3 border-border/50",
            )}
          >
            <Brain className="h-3 w-3" />
            <span className="hidden sm:inline">{t("thinkHarder")}</span>
          </button>

          {/* Search the web (Grounding) Toggle */}
          {mode === "text" && (
            <button
              type="button"
              data-testid="composer-grounding-toggle"
              onClick={() => setGrounding((prev) => !prev)}
              title={t("searchWebDesc" as any) || "Search the web (+3 credits)"}
              aria-pressed={grounding}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer border",
                grounding
                  ? "bg-accent text-accent-fg border-accent shadow-xs"
                  : "bg-surface-2 text-muted hover:text-fg hover:bg-surface-3 border-border/50",
              )}
            >
              <Search className="h-3 w-3" />
              <span className="hidden sm:inline">
                {t("searchWeb" as any) || "Search the web"}
              </span>
            </button>
          )}

          {/* Question Queue Popover (Step 6.5) */}
          <QuestionQueuePopover workspaceId={workspaceId} />
        </div>

        {/* Right Action Group: Counter + Submit/Stop */}
        <div className="flex items-center gap-2 ml-auto">
          {showCharCounter && (
            <span
              id="composer-char-count"
              className="text-[11px] font-mono text-muted"
            >
              {prompt.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
            </span>
          )}

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              aria-label={t("stop")}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-danger text-accent-fg shadow-sm transition-transform hover:opacity-90 active:scale-95 cursor-pointer"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting || !prompt.trim() || isOutOfCredits || attachments.some((a) => a.status === "uploading")}
              aria-label={t("send")}
              className={cn(
                "flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl sm:rounded-2xl shadow-sm transition-all cursor-pointer",
                prompt.trim() && !isSubmitting && !isOutOfCredits
                  ? "bg-accent text-accent-fg hover:bg-accent-hover active:scale-95"
                  : "cursor-not-allowed bg-surface-3 text-subtle opacity-60",
              )}
            >
              {isSubmitting ? (
                <Sparkles className="h-4 w-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Send className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

export default Composer;
