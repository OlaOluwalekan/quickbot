"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Home,
  MoreHorizontal,
  Send,
  Loader2,
  Trash2,
  Check,
  Globe,
  Lock,
  MessageSquare,
  RotateCcw,
  Sparkles,
  History,
  ExternalLink,
} from "lucide-react";
import Logo from "@/components/logo/Logo";
import { QuickFixBlock, ReviewChips } from "@/components/annotations/quick-fix";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnswerBody } from "@/components/response/answer-body";
import {
  MentionTextarea,
  RenderMentions,
} from "@/components/annotations/mention-textarea";
import { ThreadBreadcrumb, type BreadcrumbItem } from "./breadcrumb";
import { api, ApiClientError } from "@/lib/api/client";
import { Gated } from "@/components/ui/gated";
import { streamAskAnswer, useAskStreamStore } from "@/lib/stores/ask-stream";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import type { CitationDto } from "@/lib/api/sse";
import { cn } from "@/lib/utils";
import { ANSWER_STALE_MS } from "@/lib/annotations/limits";

export interface ThreadColumnProps {
  id: string;
  /** Position in the column stack: 1 = first column next to the main conversation. */
  index: number;
  width: number;
  workspaceId: string;
  currentUserId?: string;
  /** Caller may reply to comment threads (server re-checks). */
  canComment?: boolean;
  /** Caller may ask follow-ups in Ask threads (server re-checks). */
  canAsk?: boolean;
  /** Caller may add Ask answers to the timeline (server re-checks). */
  canPromoteToTimeline?: boolean;
  canEditResponse?: boolean;
  onBack: () => void;
  onCloseAll: () => void;
  onNavigate: (index: number) => void;
  className?: string;
}

interface AnnotationAuthor {
  id: string;
  name?: string | null;
  image?: string | null;
  username?: string | null;
}

interface AnnotationMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
  author?: AnnotationAuthor | null;
  thoughtSummary?: string | null;
  citations?: CitationDto[] | null;
  /** ASSISTANT messages: STREAMING while being written, then COMPLETE or FAILED. */
  status?: string;
}


interface PromotionItem {
  id: string;
  annotationId: string;
  messageId: string;
  target: "TIMELINE" | "NEW_WORKSPACE";
  destinationResponseId?: string | null;
  destinationWorkspaceId?: string | null;
  destinationWorkspaceTitle?: string | null;
  destinationAccessible?: boolean;
  destinationRemoved?: boolean;
}

interface AnnotationDetail {
  id: string;
  workspaceId: string;
  versionId?: string | null;
  responseId?: string | null;
  kind: "COMMENT" | "ASK";
  depth: number;
  anchorExact: string;
  visibility: "PRIVATE" | "WORKSPACE";
  authorType?: "USER" | "AI";
  suggestion?: {
    exact?: string;
    prefix?: string;
    suffix?: string;
    replacement?: string;
    category?: string;
    severity?: string;
  } | null;
  suggestionState?: "PENDING" | "ACCEPTED" | "REJECTED" | "STALE" | null;
  questionState?: string | null;
  resolvedAt?: string | null;
  createdById: string;
  createdBy?: AnnotationAuthor | null;
  version?: {
    id: string;
    content: string;
    edits?: Array<{ revision: number; content: string }>;
  } | null;
  messages: AnnotationMessage[];
  promotions?: PromotionItem[];
}

const composerInputClass =
  "w-full text-sm bg-transparent border-0 resize-none p-2.5 focus:ring-0 focus:outline-none text-foreground placeholder:text-muted";

export function ThreadColumn({
  id,
  index,
  width,
  workspaceId,
  currentUserId,
  canComment = true,
  canAsk = true,
  canPromoteToTimeline = true,
  canEditResponse = true,
  onBack,
  onCloseAll,
  onNavigate,
  className,
}: ThreadColumnProps) {
  const t = useTranslations("Threads");

  const [annotation, setAnnotation] = React.useState<AnnotationDetail | null>(null);
  const [chain, setChain] = React.useState<AnnotationDetail[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadedAt, setLoadedAt] = React.useState(0);
  const [inputText, setInputText] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [promotingKey, setPromotingKey] = React.useState<string | null>(null);
  const [localPromotions, setLocalPromotions] = React.useState<PromotionItem[]>([]);
  const [pickerMsgId, setPickerMsgId] = React.useState<string | null>(null);
  const [projectsList, setProjectsList] = React.useState<
    Array<{ id: string; name: string }> | null
  >(null);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);

  const stream = useAskStreamStore((s) => s.streams[id]);
  const isStreaming = stream?.status === "streaming";
  // The live answer stays on screen until the saved thread has been loaded
  // ("done"), so the text never disappears for a moment.
  const showLive = !!stream && stream.status !== "failed";

  const containerRef = React.useRef<HTMLDivElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Loads the annotation with its ancestors (for the breadcrumb). `silent`
  // refreshes in place, without replacing the thread by a spinner.
  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const list = await api<AnnotationDetail[]>(
          `/api/v1/annotations/${id}/chain`
        );
        const items = Array.isArray(list) ? list : [];
        setChain(items);
        setAnnotation(items[items.length - 1] ?? null);
        setLoadedAt(Date.now());
        useThreadStackStore
          .getState()
          .rememberQuotes(items.map((a) => ({ id: a.id, quote: a.anchorExact })));
      } catch {
        if (!silent) setAnnotation(null);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [id]
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // The saved thread replaces the live text once the answer is stored.
  const streamStatus = stream?.status;
  React.useEffect(() => {
    if (streamStatus === "done") {
      void load(true).then(() => useAskStreamStore.getState().clear(id));
    } else if (streamStatus === "failed") {
      void load(true);
    }
  }, [streamStatus, id, load]);

  // Changes made elsewhere (queue run, another column, the drawer).
  React.useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ annotationId?: string }>).detail;
      if (detail?.annotationId && detail.annotationId !== id) return;
      if (useAskStreamStore.getState().streams[id]) return; // handled above
      void load(true);
    };
    window.addEventListener("annotation-changed", onChanged);
    return () => window.removeEventListener("annotation-changed", onChanged);
  }, [id, load]);

  // Keep the newest message (and the answer while it streams) in view.
  const messageCount = annotation?.messages.length ?? 0;
  const streamedLength = stream?.text.length ?? 0;
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [messageCount, streamedLength, isStreaming]);

  // Esc = Back, only when the key was pressed inside this column (menus are
  // rendered in a portal and must keep their own Esc).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    const target = e.target as HTMLElement;
    if (!containerRef.current?.contains(target)) return;
    if (target.tagName === "TEXTAREA" && inputText) return;
    e.stopPropagation();
    onBack();
  };

  // The server saves a placeholder ASSISTANT message while it writes an
  // answer. A placeholder is never shown as a message: a failed (or
  // interrupted) one becomes "could not be generated" + Retry, one that is
  // being written becomes the live text or a spinner.
  const allMessages = annotation?.messages ?? [];
  const isDeadAnswer = (m: AnnotationMessage) =>
    m.role === "ASSISTANT" &&
    (m.status === "FAILED" ||
      (m.status === "STREAMING" &&
        loadedAt - new Date(m.createdAt).getTime() > ANSWER_STALE_MS));
  const isPlaceholder = (m: AnnotationMessage) =>
    m.role === "ASSISTANT" && (m.status === "FAILED" || m.status === "STREAMING");
  const messages = allMessages.filter((m) => !isPlaceholder(m));
  const lastMessage = messages[messages.length - 1];
  const hasAnswer = messages.some((m) => m.role === "ASSISTANT");
  const isAsk = annotation?.kind === "ASK";
  const questionState = annotation?.questionState || "NONE";
  const answerFailed = stream?.status === "failed" || allMessages.some(isDeadAnswer);
  // Being answered, but not by this tab (e.g. the page was reloaded meanwhile).
  const answeringElsewhere =
    !showLive && allMessages.some((m) => isPlaceholder(m) && !isDeadAnswer(m));
  // A question is saved, but no answer is stored and none is on its way.
  const needsAnswer =
    isAsk &&
    (questionState === "NONE" || questionState === "ANSWERED") &&
    lastMessage?.role === "USER" &&
    !showLive &&
    !answeringElsewhere;

  // Wait for an answer that is written elsewhere.
  React.useEffect(() => {
    if (!answeringElsewhere) return;
    const timer = setTimeout(() => void load(true), 4000);
    return () => clearTimeout(timer);
  }, [answeringElsewhere, loadedAt, load]);

  const handleAnswer = () => {
    if (!annotation) return;
    void streamAskAnswer(annotation.id, {
      idempotencyKey: `askretry_${annotation.id}_${Date.now()}`,
    });
  };

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSubmitting || isStreaming || !annotation) return;

    if (annotation.kind === "ASK") {
      // Follow-up: the question and its answer appear right away.
      setInputText("");
      void streamAskAnswer(annotation.id, {
        prompt: trimmed,
        idempotencyKey: `followup_${annotation.id}_${Date.now()}`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await api(`/api/v1/annotations/${annotation.id}/messages`, {
        method: "POST",
        json: { content: trimmed },
      });
      setInputText("");
      await load(true);
      window.dispatchEvent(
        new CustomEvent("annotation-changed", {
          detail: { annotationId: annotation.id },
        })
      );
    } catch {
      toast.error(t("sendFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleResolve = async () => {
    if (!annotation) return;
    const wasResolved = Boolean(annotation.resolvedAt);
    try {
      await api(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        json: { resolved: !wasResolved },
      });
      setAnnotation((prev) =>
        prev
          ? { ...prev, resolvedAt: wasResolved ? null : new Date().toISOString() }
          : null
      );
      toast.success(wasResolved ? t("reopened") : t("resolved"));
    } catch {
      toast.error(t("updateFailed"));
    }
  };

  const handleToggleVisibility = async () => {
    if (!annotation) return;
    const next = annotation.visibility === "PRIVATE" ? "WORKSPACE" : "PRIVATE";
    try {
      await api(`/api/v1/annotations/${annotation.id}`, {
        method: "PATCH",
        json: { visibility: next },
      });
      setAnnotation((prev) => (prev ? { ...prev, visibility: next } : null));
    } catch {
      toast.error(t("updateFailed"));
    }
  };

  const handleDelete = async () => {
    if (!annotation) return;
    try {
      await api(`/api/v1/annotations/${annotation.id}`, { method: "DELETE" });
      toast.success(t("deleted"));
      window.dispatchEvent(
        new CustomEvent("annotation-changed", {
          detail: { annotationId: annotation.id },
        })
      );
      onBack();
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const breadcrumbItems: BreadcrumbItem[] = React.useMemo(
    () =>
      chain.map((item) => ({
        id: item.id,
        quote: item.anchorExact,
        depth: item.depth,
        kind: "annotation" as const,
      })),
    [chain]
  );

  const promotionsByKey = React.useMemo(() => {
    const map = new Map<string, PromotionItem>();
    for (const p of annotation?.promotions ?? []) {
      map.set(`${p.messageId}:${p.target}`, p);
    }
    for (const p of localPromotions) {
      if (!annotation || p.annotationId === annotation.id) {
        map.set(`${p.messageId}:${p.target}`, p);
      }
    }
    return map;
  }, [annotation, localPromotions]);

  const openWorkspacePicker = async (messageId: string) => {
    if (pickerMsgId === messageId) {
      setPickerMsgId(null);
      return;
    }
    setPickerMsgId(messageId);
    if (projectsList !== null || isLoadingProjects) return;
    setIsLoadingProjects(true);
    try {
      const res = await api<{ items?: Array<{ id: string; name: string }> }>(
        "/api/v1/projects?limit=50"
      );
      setProjectsList(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setProjectsList([]);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handlePromote = async (
    messageId: string,
    target: "TIMELINE" | "NEW_WORKSPACE",
    projectId?: string | null
  ) => {
    if (!annotation) return;
    const key = `${messageId}:${target}`;
    if (promotingKey === key) return;
    setPromotingKey(key);
    if (target === "NEW_WORKSPACE") {
      setPickerMsgId(null);
    }
    try {
      const created = await api<PromotionItem>(
        `/api/v1/annotations/${annotation.id}/promote`,
        {
          method: "POST",
          json: {
            messageId,
            target,
            ...(target === "NEW_WORKSPACE" && projectId ? { projectId } : {}),
          },
        }
      );
      setLocalPromotions((prev) => {
        const rest = prev.filter(
          (p) => !(p.messageId === messageId && p.target === target)
        );
        return [...rest, created];
      });
      setAnnotation((prev) => {
        if (!prev) return prev;
        const rest = (prev.promotions ?? []).filter(
          (p) => !(p.messageId === messageId && p.target === target)
        );
        return { ...prev, promotions: [...rest, created] };
      });
      window.dispatchEvent(
        new CustomEvent("annotation-changed", {
          detail: { annotationId: annotation.id },
        })
      );
      if (target === "TIMELINE") {
        window.dispatchEvent(
          new CustomEvent("workspace-responses-changed", {
            detail: { workspaceId },
          })
        );
      }
    } catch (err) {
      // Server messages are not translated: show our own text.
      const forbidden = err instanceof ApiClientError && err.status === 403;
      toast.error(
        forbidden
          ? target === "NEW_WORKSPACE"
            ? t("promoteProjectForbidden")
            : t("promoteForbidden")
          : t("promoteFailed")
      );
    } finally {
      setPromotingKey((cur) => (cur === key ? null : cur));
    }
  };

  const isResolved = Boolean(annotation?.resolvedAt);
  const isAuthor = annotation?.createdById === currentUserId;
  const showComposer =
    !!annotation &&
    (annotation.kind === "ASK" ? canAsk && hasAnswer : canComment);

  // Swipe right on the header = Back (touch screens)
  const touchStartXRef = React.useRef<number | null>(null);
  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleHeaderTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartXRef.current;
    touchStartXRef.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start !== null && end !== undefined && end - start > 60) onBack();
  };

  // Review comment (F3.3): the text its quick fix applies to.
  const reviewVersion = annotation?.version ?? null;
  const quickFixCtx = React.useMemo(
    () =>
      reviewVersion
        ? {
            versionId: reviewVersion.id,
            responseId: annotation?.responseId ?? null,
            savedContent: reviewVersion.edits?.[0]?.content ?? reviewVersion.content,
            baseRevision: reviewVersion.edits?.[0]?.revision ?? null,
            canEdit: canEditResponse,
          }
        : null,
    [reviewVersion, annotation?.responseId, canEditResponse]
  );

  const renderMessage = (msg: {
    key: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt?: string;
    author?: AnnotationAuthor | null;
    /** Saved ASSISTANT message: its text can be annotated. */
    annotatableId?: string;
    thoughtSummary?: string | null;
    citations?: CitationDto[] | null;
    /** The answer is still being written. */
    live?: boolean;
  }) => {
    const isAssistant = msg.role === "ASSISTANT";
    const isAiReviewComment =
      annotation?.authorType === "AI" && msg.role === "ASSISTANT";
    const authorName = isAssistant
      ? t("assistantName")
      : msg.author?.name || msg.author?.username || t("member");

    return (
      <div
        key={msg.key}
        className={cn(
          "rounded-lg border p-3 text-sm space-y-1.5",
          isAssistant ? "bg-surface/50 border-border" : "bg-surface border-border/60"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isAiReviewComment ? (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-accent/10 text-accent">
                <Logo size="icon" className="h-3 w-3" />
              </div>
            ) : (
              <Avatar className="w-5 h-5">
                {!isAssistant && <AvatarImage src={msg.author?.image || undefined} />}
                <AvatarFallback className="text-[10px]">
                  {isAssistant ? (
                    <Sparkles className="w-3 h-3 text-accent" />
                  ) : (
                    authorName.charAt(0).toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>
            )}
            <span className="font-semibold text-foreground text-xs">{authorName}</span>
          </div>
          {msg.createdAt && (
            <time className="text-[10px] text-muted" dateTime={msg.createdAt}>
              {new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </div>

        {isAiReviewComment && annotation && (
          <ReviewChips suggestion={annotation.suggestion} className="pt-0.5" />
        )}

        <div className="text-foreground/90 leading-relaxed break-words">
          {isAssistant ? (
            msg.live && !msg.content && !msg.thoughtSummary ? (
              <span className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("answering")}
              </span>
            ) : (
              <AnswerBody
                content={msg.content}
                thoughtSummary={msg.thoughtSummary}
                citations={msg.citations}
                isStreaming={msg.live}
                targetType="ANNOTATION_MESSAGE"
                targetId={msg.annotatableId}
                depth={annotation ? annotation.depth + 1 : 1}
                workspaceId={workspaceId}
                showCopyButton
              >
                {!msg.live &&
                  msg.annotatableId &&
                  annotation?.kind === "ASK" &&
                  msg.content.trim().length > 0 && (() => {
                    const msgId = msg.annotatableId;
                    const timelinePromo = promotionsByKey.get(`${msgId}:TIMELINE`);
                    const workspacePromo = promotionsByKey.get(`${msgId}:NEW_WORKSPACE`);
                    const timelineBusy = promotingKey === `${msgId}:TIMELINE`;
                    const workspaceBusy = promotingKey === `${msgId}:NEW_WORKSPACE`;
                    const showPicker = pickerMsgId === msgId;

                    return (
                      <div
                        className="mt-2.5 pt-2 border-t border-border/60 space-y-2"
                        data-testid={`message-promotions-${msgId}`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          {timelinePromo ? (
                            <a
                              href={`#response-${timelinePromo.destinationResponseId ?? ""}`}
                              data-testid={`chip-view-timeline-${msgId}`}
                              onClick={(e) => {
                                const destId = timelinePromo.destinationResponseId;
                                if (!destId) return;
                                e.preventDefault();
                                onCloseAll();
                                setTimeout(() => {
                                  document
                                    .getElementById(`response-${destId}`)
                                    ?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "center",
                                    });
                                }, 50);
                              }}
                              className="inline-flex h-6 items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2 text-[11px] font-medium text-accent hover:bg-accent/20 transition-colors cursor-pointer"
                            >
                              <Check className="h-3 w-3" />
                              <span>{t("addedToTimeline")}</span>
                            </a>
                          ) : (
                            <Gated
                              reason={
                                canPromoteToTimeline
                                  ? null
                                  : {
                                      code: "no_permission",
                                      capability: t("capAddToTimeline"),
                                    }
                              }
                            >
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={timelineBusy}
                                data-testid={`btn-promote-timeline-${msgId}`}
                                onClick={() => void handlePromote(msgId, "TIMELINE")}
                                className="h-6 px-2 text-[11px] gap-1 text-foreground hover:text-accent"
                              >
                                {timelineBusy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <History className="h-3 w-3" />
                                )}
                                <span>{t("addToTimeline")}</span>
                              </Button>
                            </Gated>
                          )}

                          {workspacePromo ? (
                            workspacePromo.destinationRemoved ? (
                              <span
                                data-testid={`chip-workspace-removed-${msgId}`}
                                className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-[11px] text-muted"
                              >
                                {t("workspaceRemoved")}
                              </span>
                            ) : workspacePromo.destinationAccessible === false ? (
                              <span
                                data-testid={`chip-workspace-inaccessible-${msgId}`}
                                className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-[11px] text-muted"
                              >
                                {t("startedAnotherWorkspace")}
                              </span>
                            ) : (
                              <Link
                                href={`/workspaces/${workspacePromo.destinationWorkspaceId ?? ""}`}
                                data-testid={`chip-open-workspace-${msgId}`}
                                className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-[11px] font-medium text-foreground hover:text-accent transition-colors"
                              >
                                <ExternalLink className="h-3 w-3 text-accent" />
                                <span className="truncate max-w-[14rem]">
                                  {t("startedWorkspace", {
                                    title:
                                      workspacePromo.destinationWorkspaceTitle ||
                                      t("untitledWorkspace"),
                                  })}
                                </span>
                              </Link>
                            )
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={workspaceBusy}
                              data-testid={`btn-promote-workspace-${msgId}`}
                              onClick={() => void openWorkspacePicker(msgId)}
                              className="h-6 px-2 text-[11px] gap-1 text-foreground hover:text-accent"
                            >
                              {workspaceBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ExternalLink className="h-3 w-3" />
                              )}
                              <span>{t("newWorkspace")}</span>
                            </Button>
                          )}
                        </div>

                        {showPicker && !workspacePromo && (
                          <div
                            data-testid={`promote-project-picker-${msgId}`}
                            className="rounded-md border border-border bg-surface-2/80 p-2 space-y-1.5 text-xs"
                          >
                            <p className="text-[11px] font-medium text-muted">
                              {t("chooseWorkspaceLocation")}
                            </p>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                data-testid={`promote-project-standalone-${msgId}`}
                                onClick={() =>
                                  void handlePromote(msgId, "NEW_WORKSPACE", null)
                                }
                                className="text-left rounded px-2 py-1 hover:bg-surface text-foreground cursor-pointer"
                              >
                                {t("standaloneWorkspace")}
                              </button>
                              {isLoadingProjects && (
                                <span className="px-2 py-1 text-[11px] text-muted">
                                  {t("loadingProjects")}
                                </span>
                              )}
                              {(projectsList ?? []).map((proj) => (
                                <button
                                  key={proj.id}
                                  type="button"
                                  data-testid={`promote-project-${proj.id}`}
                                  onClick={() =>
                                    void handlePromote(msgId, "NEW_WORKSPACE", proj.id)
                                  }
                                  className="text-left rounded px-2 py-1 hover:bg-surface text-foreground truncate cursor-pointer"
                                >
                                  {proj.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </AnswerBody>
            )
          ) : (
            <RenderMentions text={msg.content} workspaceId={workspaceId} />
          )}
        </div>

        {isAiReviewComment && annotation && (
          <QuickFixBlock
            annotation={annotation}
            ctx={quickFixCtx}
            className="mt-2 pt-2 border-t border-border/60"
          />
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      style={{ width }}
      data-thread-column-index={index}
      data-testid={`thread-column-${id}`}
      className={cn(
        "flex flex-col h-full min-w-0 bg-background border-r border-border focus-visible:outline-none shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none select-text",
        className
      )}
    >
      {/* Header */}
      <div
        onTouchStart={handleHeaderTouchStart}
        onTouchEnd={handleHeaderTouchEnd}
        className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0"
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="w-7 h-7 text-muted hover:text-foreground shrink-0"
            title={t("backShortcut")}
            aria-label={t("back")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <ThreadBreadcrumb
            items={breadcrumbItems}
            onNavigate={onNavigate}
            className="truncate"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCloseAll}
            className="w-7 h-7 text-muted hover:text-foreground"
            title={t("mainShortcut")}
            aria-label={t("main")}
          >
            <Home className="w-4 h-4" />
          </Button>

          {annotation && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-muted hover:text-foreground"
                  aria-label={t("threadActions")}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 text-xs">
                {annotation.kind === "COMMENT" && (
                  <DropdownMenuItem onClick={handleToggleResolve} className="cursor-pointer">
                    <Check className="w-3.5 h-3.5 mr-2" />
                    {isResolved ? t("unresolve") : t("resolve")}
                  </DropdownMenuItem>
                )}

                {isAuthor && (
                  <DropdownMenuItem onClick={handleToggleVisibility} className="cursor-pointer">
                    {annotation.visibility === "PRIVATE" ? (
                      <>
                        <Globe className="w-3.5 h-3.5 mr-2" />
                        {t("makeWorkspaceVisible")}
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 mr-2" />
                        {t("makePrivate")}
                      </>
                    )}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs">{t("loading")}</span>
          </div>
        ) : !annotation ? (
          <div className="text-center py-12 text-muted text-xs">{t("notAvailable")}</div>
        ) : (
          <>
            {/* Quoted passage */}
            <div className="rounded-lg bg-surface border-l-2 border-accent p-3 text-xs text-foreground/90 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1 font-medium">
                  {isAsk ? (
                    <Sparkles className="w-3 h-3 text-accent" />
                  ) : (
                    <MessageSquare className="w-3 h-3 text-accent" />
                  )}
                  {isAsk ? t("askedAbout") : t("commentedOn")}
                </span>
                <span className="flex items-center gap-2 text-[10px] text-muted/80">
                  {isResolved && <span className="text-success">{t("resolvedChip")}</span>}
                  {t("level", { level: annotation.depth + 1 })}
                </span>
              </div>
              <blockquote className="italic line-clamp-3">«{annotation.anchorExact}»</blockquote>
            </div>

            <div className="space-y-3">
              {messages.map((msg) =>
                renderMessage({
                  key: msg.id,
                  role: msg.role,
                  content: msg.content,
                  createdAt: msg.createdAt,
                  author: msg.author,
                  annotatableId: msg.role === "ASSISTANT" ? msg.id : undefined,
                  thoughtSummary: msg.thoughtSummary,
                  citations: msg.citations,
                })
              )}

              {/* A follow-up that was just sent (saved by the server with its answer) */}
              {showLive && stream?.question &&
                renderMessage({
                  key: "pending-question",
                  role: "USER",
                  content: stream.question,
                  author: lastMessage?.role === "USER" ? lastMessage.author : annotation.createdBy,
                })}

              {/* The answer, shown while it streams */}
              {showLive &&
                renderMessage({
                  key: "streaming-answer",
                  role: "ASSISTANT",
                  content: stream?.text ?? "",
                  thoughtSummary: stream?.thoughtSummary,
                  citations: stream?.citations,
                  live: isStreaming,
                })}

              {isAsk && questionState === "QUEUED" && (
                <p className="text-xs text-muted">{t("queued")}</p>
              )}
              {((isAsk && questionState === "ANSWERING" && !hasAnswer) ||
                answeringElsewhere) && (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("answering")}
                </p>
              )}
              {isAsk && questionState === "FAILED" && (
                <p className="text-xs text-danger">{t("queueFailed")}</p>
              )}

              {needsAnswer && (
                <div className="flex flex-wrap items-center gap-2 text-xs" role="status">
                  <span className={answerFailed ? "text-danger" : "text-muted"}>
                    {answerFailed ? t("answerFailed") : t("noAnswerYet")}
                  </span>
                  {canAsk && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAnswer}
                      className="h-7 px-2.5 text-xs gap-1.5"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {answerFailed ? t("retry") : t("answerNow")}
                    </Button>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      {/* Footer composer: follow-up for Ask threads, reply for comment threads */}
      {showComposer && annotation && (
        <div className="border-t border-border p-3 bg-background/95 backdrop-blur-sm shrink-0">
          <div className="relative rounded-lg border border-border focus-within:border-accent bg-surface/40 transition-colors">
            {isAsk ? (
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                placeholder={t("followUpPlaceholder")}
                aria-label={t("followUpPlaceholder")}
                rows={2}
                maxLength={500}
                className={composerInputClass}
              />
            ) : (
              <MentionTextarea
                workspaceId={workspaceId}
                value={inputText}
                onChange={setInputText}
                onEnterSubmit={handleSendMessage}
                placeholder={t("replyPlaceholder")}
                aria-label={t("replyPlaceholder")}
                rows={2}
                maxLength={2000}
                className={composerInputClass}
              />
            )}
            <div className="flex items-center justify-end px-2.5 pb-2">
              <Button
                size="sm"
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isSubmitting || isStreaming}
                className="h-7 px-2.5 text-xs font-medium gap-1.5"
              >
                {isSubmitting || isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>{t("send")}</span>
                    <Send className="w-3 h-3" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
