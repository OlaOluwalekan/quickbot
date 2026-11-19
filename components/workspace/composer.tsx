"use client";

import type { GenerationSSEHandlers } from "@/lib/api/sse";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Paperclip,
  FileText,
  X,
  Check,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import { api, ApiClientError } from "@/lib/api/client";
import {
  MAX_CSV_ROWS,
  MAX_WORKSPACE_DOCUMENTS,
  WORKSPACE_DOCUMENT_ACCEPT,
  isPdfFile,
  isWorkspaceDocumentFile,
} from "@/lib/documents/workspace-document-types";
import { uploadAttachment } from "@/lib/api/attachments";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/api/error-message";
import { navigateWithTransition } from "@/lib/navigation/view-transition";
import { getClientModels, type ClientModelOption } from "@/lib/ai/model-catalog";
import type { WorkspaceDto } from "@/lib/api/hooks/workspaces";
import { queryKeys } from "@/lib/api/hooks/query-keys";
import { useEntitlements } from "@/lib/api/hooks/entitlements";
import {
  canUse,
  creditsGateReason,
  getGateReason,
  PLAN_ORDER,
  type GateReason,
} from "@/lib/entitlements/shared";
import { PLANS } from "@/server/billing/plans";
import { getIdleQueryClient, useUserPreferences } from "@/lib/api/hooks/me";
import { QuestionQueuePopover } from "@/components/workspace/question-queue-popover";
import { VoiceInput } from "./voice-input";
import { Gated } from "@/components/ui/gated";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import { PLAN_UPGRADE_HREF } from "@/lib/billing/links";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const MAX_PROMPT_LENGTH = 20_000;
const COUNTER_THRESHOLD = 18_000; // 90% of max

const formatFileSizeKb = (bytes: number) => `(${Math.max(1, Math.round(bytes / 1024))} KB)`;
const formatProgressPercent = (p: number) => `${p}%`;
const formatAttachmentColon = (name: string) => `${name}:`;
const formatCreditHint = (hint: string) => `(${hint})`;

function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "idem-" + Math.random().toString(36).substring(2, 15);
}

/**
 * Text (and mode) to put in the composer from outside, e.g. a starter
 * template. A new `nonce` re-applies it, so picking the same template twice
 * works.
 */
export interface ComposerPrefill {
  prompt: string;
  mode: "text" | "image";
  nonce: number;
}

export interface ComposerProps {
  prefill?: ComposerPrefill | null;
  placeholder?: string;
  size?: "large" | "compact";
  className?: string;
  workspaceId?: string | null;
  autoFocus?: boolean;
  onSubmitted?: () => void;
  /** The answer finished streaming (inside a workspace): its final data, before any reload. */
  onCompleted?: (
    data: Parameters<NonNullable<GenerationSSEHandlers["onCompleted"]>>[0],
    prompt: string
  ) => void;
  onStop?: () => void;
  credits?: { plan: string; balance: number };
  /** Signed-in user: reads their preferences (the "web search is off" line). */
  userId?: string;
  /** Whether the actor holds `workspace.generate` permission (defaults to true). */
  canGenerate?: boolean;
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
  prefill,
  placeholder,
  size = "large",
  className,
  workspaceId = null,
  autoFocus = false,
  onSubmitted,
  onCompleted: onCompletedProp,
  onStop,
  credits,
  userId,
  canGenerate = true,
}: ComposerProps) {
  const t = useTranslations("Chat");
  const tHome = useTranslations("Home");
  const tDocs = useTranslations("Documents");
  const tGates = useTranslations("Gates");
  const tModels = useTranslations("Models");
  const tWorkspace = useTranslations("Workspace");
  const tResponse = useTranslations("Response");
  const tErrors = useTranslations();
  const tPlans = useTranslations();
  const format = useFormatter();
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

  const { entitlements, isSuccess: entitlementsLoaded } = useEntitlements();
  // Only treat images and models as locked once the real entitlements have
  // loaded (the hook falls back to Free meanwhile). The server re-checks.
  const imageGateReason = entitlementsLoaded ? getGateReason(entitlements, "images") : null;
  const isImagePlanLocked =
    entitlementsLoaded && !canUse(entitlements, "images");
  const imagePlanName =
    tPlans(PLANS[PLAN_ORDER.find((p) => PLANS[p].limits.images) ?? "LITE"].name);
  const [imageLockedNotice, setImageLockedNotice] = React.useState(false);
  const { billingEnabled } = useSiteConfig();

  // Generation stream status for current workspace
  const currentStream = useGenerationStore((s) =>
    workspaceId ? s.streams[workspaceId] : null,
  );
  const isStreaming = currentStream?.status === "streaming";

  // Composer state
  const [prompt, setPrompt] = React.useState<string>(() => savedDraft || "");
  const [mode, setMode] = React.useState<"text" | "image">(
    storeChatMode || "text",
  );
  const [selectedModel, setSelectedModel] = React.useState<string>("text-economy");
  const clientModels = React.useMemo(
    () => getClientModels((key, values) => tModels(key, values), "TEXT"),
    [tModels]
  );
  const activeModel = (clientModels.find((m) => m.key === selectedModel) ?? clientModels[0])!;
  // F4.1: search is a Settings preference; only say so when it's off.
  const { data: preferences } = useUserPreferences(userId ?? "");
  const webSearchOff = preferences?.webSearchEnabled === false;
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // F4.5: Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = React.useState(false);
  const voiceSendHandlerRef = React.useRef<(() => Promise<void>) | null>(null);
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

  const handleModeChange = React.useCallback(
    (nextMode: "text" | "image") => {
      if (nextMode === "image" && imageGateReason) {
        return;
      }
      setMode(nextMode);
      setStoreChatMode(nextMode);
      setImageLockedNotice(false);
    },
    [setStoreChatMode, imageGateReason]
  );

  // F4.3: apply a prefill (starter template) whenever its nonce changes: set
  // the prompt and the mode, focus, and select the first {{placeholder}}.
  const lastPrefillNonceRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!prefill || prefill.nonce === lastPrefillNonceRef.current) return;
    lastPrefillNonceRef.current = prefill.nonce;

    const nextPrompt = prefill.prompt;
    setPrompt(nextPrompt);
    const el = textareaRef.current;
    if (el) {
      el.value = nextPrompt;
      adjustHeight();
      el.focus();
      const match = /\{\{([^}]+)\}\}/.exec(nextPrompt);
      if (match) {
        el.setSelectionRange(match.index, match.index + match[0].length);
      }
    }

    if (prefill.mode === "image" && isImagePlanLocked) {
      // Keep the prompt, stay in Chat, and say why.
      handleModeChange("text");
      setImageLockedNotice(true);
    } else {
      handleModeChange(prefill.mode);
    }
  }, [prefill, isImagePlanLocked, adjustHeight, handleModeChange]);

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

  const [attachments, setAttachments] = React.useState<ComposerAttachment[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = React.useState(false);
  const [pendingDropFiles, setPendingDropFiles] = React.useState<File[]>([]);
  const [isAddingDocument, setIsAddingDocument] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  // F4.4: in a workspace the owner's plan sets the limits and existing
  // attachments count too (as the upload check does); the home composer has
  // no workspace yet, so the viewer's own plan applies.
  // Same query as `useWorkspace` (shared cache), but it tolerates a render
  // without a QueryClient, like the other composer hooks.
  const { data: workspaceData } = useQuery(
    {
      queryKey:
        userId && workspaceId
          ? queryKeys.workspaces.detail(userId, workspaceId)
          : (["workspaces", "detail", "none"] as const),
      queryFn: ({ signal }) =>
        api<WorkspaceDto>(`/api/v1/workspaces/${workspaceId}`, { signal }),
      enabled: Boolean(userId && workspaceId && queryClient),
    },
    queryClient ?? getIdleQueryClient()
  );
  const attachmentLimits = workspaceData?.attachmentLimits;
  const attachmentMax = attachmentLimits?.max ?? entitlements.limits.attachmentsPerWorkspace;
  const MAX_ATTACHMENTS = Math.max(0, attachmentMax - (attachmentLimits?.used ?? 0));
  const maxFileMB = attachmentLimits?.maxFileMB ?? entitlements.limits.maxFileMB;
  const MAX_FILE_SIZE = maxFileMB * 1024 * 1024;

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
      const msg = getApiErrorMessage(err, tErrors);
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === item.id ? { ...a, status: "error", error: msg } : a
        )
      );
    }
  }, [workspaceId, queryClient, tErrors]);

  const handleFiles = React.useCallback((files: File[]) => {
    if (files.length === 0) return;
    setCreationError(null);

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setCreationError(t("attachLimitReached", { limit: attachmentMax }));
      return;
    }

    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        setCreationError(t("attachSizeExceeded", { mb: maxFileMB }));
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
  }, [attachments.length, MAX_ATTACHMENTS, MAX_FILE_SIZE, attachmentMax, maxFileMB, t, uploadItem]);

  const handleWorkspaceDocumentFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setCreationError(null);
      setPendingDropFiles([]);

      for (const f of files) {
        if (isPdfFile(f)) {
          setCreationError(tDocs("errors.pdfNotSupported"));
          return;
        }
        if (!isWorkspaceDocumentFile(f)) {
          setCreationError(tDocs("errors.unsupported"));
          return;
        }
        if (f.size > MAX_FILE_SIZE) {
          setCreationError(t("attachSizeExceeded", { mb: maxFileMB }));
          return;
        }
      }

      setIsAddingDocument(true);
      try {
        let targetWsId = workspaceId || targetWorkspaceIdRef.current;
        const createdFromHome = !workspaceId;

        if (!targetWsId) {
          const defaultTitle =
            files[0]?.name.replace(/\.[^.]+$/, "") || tWorkspace("defaultTitle");
          const newWs = await api<WorkspaceDto>("/api/v1/workspaces", {
            method: "POST",
            body: { title: defaultTitle },
          });
          targetWsId = newWs.id;
          targetWorkspaceIdRef.current = newWs.id;
          queryClient?.invalidateQueries({ queryKey: ["workspaces"] });
        }

        for (const file of files) {
          const attId = await uploadAttachment(file, targetWsId);
          const added = await api<{
            truncated?: boolean;
            totalRows?: number | null;
          }>(`/api/v1/workspaces/${targetWsId}/documents`, {
            method: "POST",
            body: { attachmentId: attId },
          });
          // Part of the file was left out: say so, it isn't visible otherwise.
          if (added?.truncated) {
            toast.warning(
              typeof added.totalRows === "number" &&
                added.totalRows > MAX_CSV_ROWS
                ? tDocs("csvRowsNote", {
                    shown: MAX_CSV_ROWS,
                    total: added.totalRows,
                  })
                : tDocs("truncatedNote", { name: file.name })
            );
          }
        }

        window.dispatchEvent(
          new CustomEvent("workspace-responses-changed", {
            detail: { workspaceId: targetWsId },
          })
        );
        queryClient?.invalidateQueries({ queryKey: ["workspaces"] });

        if (createdFromHome && targetWsId) {
          navigateWithTransition(router, `/workspaces/${targetWsId}`);
        }
      } catch (err: unknown) {
        // Codes sent by the documents endpoint; anything else keeps the
        // server's own message (plan limits, file checks).
        const code = err instanceof ApiClientError ? err.code : null;
        const known: Record<string, string> = {
          document_type_unsupported: tDocs("errors.unsupported"),
          document_page_limit: tDocs("errors.pageLimit"),
          document_unreadable: tDocs("errors.unreadable"),
          document_empty: tDocs("errors.empty"),
          document_timeout: tDocs("errors.timeout"),
          document_limit: tDocs("errors.limit", {
            count: MAX_WORKSPACE_DOCUMENTS,
          }),
        };
        setCreationError(
          (code && known[code]) ||
            getApiErrorMessage(err, tErrors, tDocs("errors.uploadFailed"))
        );
      } finally {
        setIsAddingDocument(false);
      }
    },
    [MAX_FILE_SIZE, maxFileMB, queryClient, router, t, tDocs, workspaceId]
  );

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

  // Home: the viewer's own balance (`credits`). Workspace: the owner pays.
  const creditsGate: GateReason | null =
    credits && credits.balance <= 0
      ? { code: "out_of_credits" }
      : creditsGateReason(workspaceData);
  const isOutOfCredits = Boolean(creditsGate);
  const isAttachmentLimitReached = attachments.length >= MAX_ATTACHMENTS;
  const attachmentGateReason: GateReason | null = isAttachmentLimitReached
    ? { code: "attachment_limit", limit: attachmentMax }
    : null;
  const submitGateReason: GateReason | null = !canGenerate
    ? { code: "no_permission", capability: t("capGenerate") }
    : creditsGate;

  // Voice input is billed to the speaker, but a transcript is only useful if
  // it can be sent, so the mic follows the same credits gate as Send (with its
  // own reason: "you" vs "the workspace owner"). The server checks the
  // speaker's own balance and daily seconds.
  const voiceGateReason: GateReason | null = creditsGate;

  const handleSubmit = async (overridePrompt?: string) => {
    // F4.5: If user clicked Send while recording voice, delegate to voice handler
    if (isRecordingVoice && voiceSendHandlerRef.current && !overridePrompt) {
      await voiceSendHandlerRef.current();
      return;
    }

    const cleanPrompt = (overridePrompt ?? prompt).trim();
    const isUploadingAny = attachments.some((a) => a.status === "uploading");
    if (!cleanPrompt || isSubmitting || isStreaming || isOutOfCredits || !canGenerate || isUploadingAny) return;
    if (mode === "image" && imageGateReason) return;
    const readyAttachmentIds = attachments
      .filter((a) => a.status === "ready" && a.attachmentId)
      .map((a) => a.attachmentId!);

    if (mode === "image" && (attachments.length > 0 || readyAttachmentIds.length > 0)) {
      setCreationError(t("imageWithAttachments"));
      return;
    }

    const effectiveModelKey = mode === "image" ? "image-standard" : selectedModel;
    const effectiveKind = mode === "image" ? "IMAGE" : "TEXT";

    setIsSubmitting(true);
    setCreationError(null);

    // If already inside an existing workspace
    if (workspaceId) {
      clearDraft(draftKey);
      setPrompt("");
      setAttachments([]);
      // The sent attachments now count toward the workspace limit.
      if (userId && attachments.length > 0) {
        queryClient?.invalidateQueries({
          queryKey: queryKeys.workspaces.detail(userId, workspaceId),
        });
      }
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
              // Put the finished answer in the list first, then end the
              // stream: the final card replaces the streaming one in one go.
              onCompletedProp?.(data, cleanPrompt);
              useGenerationStore.getState().completeStream(workspaceId, data.content, data.citations);
            },
            onError: (err) => {
              useGenerationStore.getState().failStream(workspaceId, err.code || "unknown");
            },
          },
        );
        onSubmitted?.();
      } catch (err: unknown) {
        useGenerationStore.getState().failStream(workspaceId, getApiErrorCode(err) ?? "unknown");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // HOME PAGE: Blank -> Workspace smooth transition
    try {
      const idempotencyKey = safeRandomUUID();
      const titleCandidate =
        cleanPrompt.slice(0, 60).replace(/["'\n\r]/g, "").trim() || tWorkspace("defaultTitle");

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

  const handleInsertTranscript = React.useCallback(
    (text: string) => {
      if (!text || typeof text !== "string") return;

      const textarea = textareaRef.current;
      if (!textarea) {
        setPrompt((prev) => {
          const updated = prev ? `${prev} ${text}` : text;
          setDraft(draftKey, updated);
          return updated;
        });
        return;
      }

      const start = textarea.selectionStart ?? prompt.length;
      const end = textarea.selectionEnd ?? prompt.length;
      const before = prompt.slice(0, start);
      const after = prompt.slice(end);
      const insertText = before && !before.endsWith(" ") ? ` ${text}` : text;
      const newPrompt = `${before}${insertText}${after.startsWith(" ") || !after ? after : ` ${after}`}`;

      setPrompt(newPrompt);
      setDraft(draftKey, newPrompt);

      setTimeout(() => {
        textarea.focus();
        const newCursor = before.length + (insertText?.length ?? 0);
        textarea.setSelectionRange(newCursor, newCursor);
        adjustHeight();
      }, 0);
    },
    [prompt, draftKey, setDraft, adjustHeight]
  );

  // Send while recording: what was already typed is kept, the transcript is
  // added after it, and the whole text is sent as the prompt.
  const handleSendTranscript = (transcript: string) => {
    if (!transcript || typeof transcript !== "string") return;
    const typed = prompt.trim();
    void handleSubmit(typed ? `${typed} ${transcript}` : transcript);
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

  return (
    <form
      role="region"
      aria-label={tWorkspace("composerAria")}
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
        if (files.length === 0) return;
        // Only files that can become a document get the choice; a PDF or an
        // image is attached to the message directly.
        const allDocs =
          mode !== "image" && files.every((f) => isWorkspaceDocumentFile(f));
        if (allDocs) {
          setPendingDropFiles(files);
        } else {
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
      {(isDragging || pendingDropFiles.length > 0) && (
        <div
          data-testid="composer-drop-overlay"
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl sm:rounded-3xl border-2 border-dashed border-accent bg-surface/95 p-4 backdrop-blur-xs"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted">
            <Paperclip className="h-4 w-4 text-accent" />
            <span>
              {pendingDropFiles.length > 0
                ? tDocs("dropChoose")
                : t("dropFilesHere")}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              data-testid="drop-attach-to-message"
              onClick={() => {
                if (pendingDropFiles.length > 0) {
                  const files = pendingDropFiles;
                  setPendingDropFiles([]);
                  handleFiles(files);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                setPendingDropFiles([]);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) handleFiles(files);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg hover:border-accent hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer"
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span>{tDocs("attachToMessage")}</span>
            </button>
            {mode !== "image" && (
              <button
                type="button"
                data-testid="drop-add-to-workspace"
                onClick={() => {
                  if (pendingDropFiles.length > 0) {
                    const files = pendingDropFiles;
                    setPendingDropFiles([]);
                    void handleWorkspaceDocumentFiles(files);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  setPendingDropFiles([]);
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length > 0) void handleWorkspaceDocumentFiles(files);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-info/40 bg-info/10 px-3 py-1.5 text-xs font-medium text-info hover:bg-info/20 transition-colors cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{tDocs("addToWorkspace")}</span>
              </button>
            )}
            {pendingDropFiles.length > 0 && (
              <button
                type="button"
                aria-label={tDocs("cancelDrop")}
                title={tDocs("cancelDrop")}
                onClick={() => setPendingDropFiles([])}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live Region: screen reader announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Out of Credits Alert */}
      {creditsGate && (
        <div
          id="credits-warning"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-warning/10 border border-warning/20 px-3 py-1.5 text-xs text-warning"
        >
          {creditsGate.code === "member_credit_cap" ? (
            // Only the owner can raise it: no upgrade link.
            <span>{tGates("member_credit_cap", { cap: creditsGate.cap })}</span>
          ) : creditsGate.code === "owner_out_of_credits" ? (
            // A member can't top up the owner's account: no upgrade link.
            <span>{tGates("owner_out_of_credits")}</span>
          ) : (
            <>
              <span>{t("outOfCreditsReason")}</span>
              <Link
                href="/settings"
                className="font-semibold underline hover:text-fg transition-colors"
              >
                {t("upgradeCta")}
              </Link>
            </>
          )}
        </div>
      )}

      {/* Image Plan-Locked Alert */}
      {imageLockedNotice && (
        <div
          role="status"
          id="image-plan-locked-warning"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-accent-soft border border-border px-3 py-1.5 text-xs text-accent"
        >
          <span>{t("imagePlanLocked", { plan: imagePlanName })}</span>
          {billingEnabled && (
            <Link
              href={PLAN_UPGRADE_HREF}
              className="font-semibold underline hover:text-fg transition-colors"
            >
              {tGates("upgrade")}
            </Link>
          )}
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
            onClick={() => handleSubmit()}
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
                {formatFileSizeKb(att.size)}
              </span>

              {att.status === "uploading" && (
                <div className="flex items-center gap-1 text-[10px] text-accent">
                  <Loader2 className="size-3 animate-spin" />
                  <span>{formatProgressPercent(att.progress)}</span>
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
                    <span className="font-semibold">{formatAttachmentColon(a.name)}</span> {a.error}
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
              <span>{tWorkspace("attachmentLimitReached")}</span>
              <div className="flex items-center gap-2">
                <Link
                  href="/settings/billing"
                  className="font-medium text-accent hover:underline cursor-pointer"
                >
                  {tResponse("upgradePlan")}
                </Link>
                <span>•</span>
                <Link
                  href="/workspaces"
                  className="font-medium text-fg hover:underline cursor-pointer"
                >
                  {tWorkspace("startNew")}
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
        {/* Left Action Group: Mode + Attach + Voice + Model + Queue */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Mode Switch (Text / Image) */}
          <div className="flex items-center gap-0.5 rounded-xl bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => handleModeChange("text")}
              aria-pressed={mode === "text"}
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
            <Gated reason={imageGateReason}>
              <button
                type="button"
                onClick={() => {
                  if (!imageGateReason) {
                    handleModeChange("image");
                  }
                }}
                aria-pressed={mode === "image"}
                data-testid="mode-tab-image"
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
            </Gated>
          </div>

          {/* Hidden File Input (Attach to message) */}
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
            data-testid="composer-attach-input"
          />

          {/* Hidden File Input (Add to workspace as a document) */}
          <input
            type="file"
            ref={docFileInputRef}
            multiple
            onChange={(e) => {
              if (e.target.files) {
                void handleWorkspaceDocumentFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
            accept={WORKSPACE_DOCUMENT_ACCEPT}
            className="hidden"
            aria-hidden="true"
            data-testid="composer-document-input"
          />

          {/* Attach Menu Button */}
          {attachmentGateReason ? (
            // F4.4: limit reached: the button stays visible, disabled, with the reason.
            <Gated reason={attachmentGateReason}>
              <button
                type="button"
                aria-label={t("attachFile")}
                data-testid="composer-attach-btn"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted"
              >
                <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </Gated>
          ) : (
            <Popover
              open={attachMenuOpen}
              onOpenChange={setAttachMenuOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={t("attachFile")}
                  aria-label={t("attachFile")}
                  disabled={isAddingDocument}
                  data-testid="composer-attach-btn"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isAddingDocument ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-64 p-1.5"
                data-testid="composer-attach-menu"
              >
                <button
                  type="button"
                  data-testid="menu-attach-to-message"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <Paperclip className="h-3.5 w-3.5 text-muted shrink-0" />
                  <span>{tDocs("attachToMessage")}</span>
                </button>
                <button
                  type="button"
                  data-testid="menu-add-to-workspace"
                  disabled={mode === "image"}
                  onClick={() => {
                    setAttachMenuOpen(false);
                    docFileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="h-3.5 w-3.5 text-info shrink-0" />
                  <span>{tDocs("addToWorkspace")}</span>
                </button>
              </PopoverContent>
            </Popover>
          )}

          {/* Voice Input Mic Button (Step F4.5) */}
          <VoiceInput
            onInsertTranscript={handleInsertTranscript}
            onSendTranscript={handleSendTranscript}
            disabled={isSubmitting || isStreaming || !canGenerate}
            gateReason={voiceGateReason}
            onRecordingChange={setIsRecordingVoice}
            registerSendHandler={(handler) => {
              voiceSendHandlerRef.current = handler;
            }}
          />

          {/* Model Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid="composer-model-trigger"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium bg-surface-2 text-fg hover:bg-surface-3 transition-colors cursor-pointer border border-border/50"
              >
                <Sparkles className="h-3 w-3 text-accent" />
                <span className="max-w-[110px] truncate">{activeModel.name}</span>
                <span className="text-[10px] text-muted">{formatCreditHint(activeModel.creditHint)}</span>
                <ChevronDown className="h-3 w-3 text-muted" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1.5 space-y-1">
              <div className="px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
                {t("model")}
              </div>
              {clientModels.map((m: ClientModelOption) => {
                const modelGateReason = entitlementsLoaded
                  ? getGateReason(entitlements, m.key)
                  : null;
                return (
                  <Gated key={m.key} reason={modelGateReason} side="right" className="w-full">
                    <button
                      type="button"
                      data-testid={`model-option-${m.key}`}
                      onClick={() => {
                        if (!modelGateReason) {
                          setSelectedModel(m.key);
                        }
                      }}
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
                    </button>
                  </Gated>
                );
              })}
            </PopoverContent>
          </Popover>

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
              {t("charCount", { current: format.number(prompt.length), max: format.number(MAX_PROMPT_LENGTH) })}
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
            <Gated reason={submitGateReason}>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  (!prompt.trim() && !isRecordingVoice) ||
                  isOutOfCredits ||
                  !canGenerate ||
                  attachments.some((a) => a.status === "uploading")
                }
                aria-label={t("send")}
                className={cn(
                  "flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl sm:rounded-2xl shadow-sm transition-all cursor-pointer",
                  (prompt.trim() || isRecordingVoice) && !isSubmitting && !isOutOfCredits && canGenerate
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
            </Gated>
          )}
        </div>
      </div>
      {webSearchOff && (
        <p className="mt-1.5 text-center text-[11px] text-muted">
          {t("webSearchOff")} ·{" "}
          <Link href="/settings" className="underline hover:text-fg">
            {t("changeInSettings")}
          </Link>
        </p>
      )}
    </form>
  );
}

export default Composer;
