"use client";

import * as React from "react";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import { MessageSquare, HelpCircle, X, Send } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Gated } from "@/components/ui/gated";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api/client";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { streamAskAnswer } from "@/lib/stores/ask-stream";
import { selectionToAnchor, type Anchor } from "@/lib/annotations";
import { MAX_ANNOTATION_DEPTH } from "@/lib/annotations/limits";
import { MentionTextarea } from "./mention-textarea";
import { cn } from "@/lib/utils";
import type { GateReason } from "@/lib/entitlements/shared";

export type ToolbarMode = "idle" | "comment" | "ask";

export interface SelectionTargetMetadata {
  targetType: "RESPONSE_VERSION" | "ANNOTATION_MESSAGE" | "DOCUMENT_REVISION";
  targetId: string;
  responseId?: string;
  versionId?: string;
  depth: number;
  contentSource: "ORIGINAL" | "EDIT";
  editRevision?: number;
  workspaceId?: string;
  /** Column the selection is in: 0 = main conversation, n = nth thread column. */
  columnIndex: number;
  /**
   * The text has unsaved changes (document draft, F3.2/F3.3). The server
   * checks a highlight against the saved text, so Comment and Ask are held
   * back until the changes are saved.
   */
  unsaved?: boolean;
}

export interface SelectionToolbarProps {
  /** Workspace the annotatable surfaces belong to (used for @mentions). */
  workspaceId?: string;
  canAnnotate?: boolean;
  canComment?: boolean;
  canAsk?: boolean;
  canGenerate?: boolean;
  isOutOfCredits?: boolean;
  onCommentCreated?: (annotation: unknown) => void;
  onQuestionCreated?: (annotation: unknown) => void;
  onAskNow?: (annotation: unknown) => void;
  onReplyTriggered?: (data: {
    anchor: Anchor;
    prompt: string;
    responseId: string;
    versionId: string;
    contentSource: string;
    editRevision?: number;
  }) => void;
}

export function SelectionToolbar({
  workspaceId: workspaceIdProp,
  canAnnotate = true,
  canComment: explicitCanComment,
  canAsk: explicitCanAsk,
  canGenerate = true,
  isOutOfCredits = false,
  onCommentCreated,
  onQuestionCreated,
  onAskNow,
  onReplyTriggered,
}: SelectionToolbarProps) {
  const t = useTranslations("Annotations.toolbar");
  const tNotes = useTranslations("Notes");

  const effectiveCanComment = explicitCanComment ?? canAnnotate;
  const effectiveCanAsk = explicitCanAsk ?? (canAnnotate && canGenerate);

  const [isVisible, setIsVisible] = React.useState(false);
  const [mode, setMode] = React.useState<ToolbarMode>("idle");
  const [activeRange, setActiveRange] = React.useState<Range | null>(null);
  const [activeAnchor, setActiveAnchor] = React.useState<Anchor | null>(null);
  const [metadata, setMetadata] = React.useState<SelectionTargetMetadata | null>(null);

  const [commentText, setCommentText] = React.useState("");
  const [askText, setAskText] = React.useState("");
  const [questionQueueCount, setQuestionQueueCount] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const [isCoarsePointer, setIsCoarsePointer] = React.useState(false);
  // Shortcut modifier and hints follow the user's OS (⌘ on Apple devices,
  // Ctrl elsewhere). Known only in the browser, so it starts as non-Mac.
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const commentInputRef = React.useRef<HTMLTextAreaElement>(null);
  const askInputRef = React.useRef<HTMLInputElement>(null);
  const askTextRef = React.useRef("");
  React.useEffect(() => {
    askTextRef.current = askText;
  }, [askText]);

  // Detect coarse pointer (touch device)
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(pointer: coarse)");
    setIsCoarsePointer(mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      setIsCoarsePointer(e.matches);
    };

    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);

  // Update position via Floating UI
  const updatePosition = React.useCallback(() => {
    if (!activeRange || !popoverRef.current || isCoarsePointer) return;

    const virtualEl = {
      getBoundingClientRect: () => {
        if (typeof activeRange.getBoundingClientRect === "function") {
          return activeRange.getBoundingClientRect();
        }
        return {
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      },
    };

    computePosition(virtualEl, popoverRef.current, {
      placement: "top",
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ["bottom", "top"] }),
        shift({ padding: 8 }),
      ],
    }).then(({ x, y }) => {
      if (popoverRef.current) {
        popoverRef.current.style.left = `${Math.round(x)}px`;
        popoverRef.current.style.top = `${Math.round(y)}px`;
      }
    });
  }, [activeRange, isCoarsePointer]);

  React.useEffect(() => {
    if (isVisible && !isCoarsePointer) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isVisible, updatePosition, isCoarsePointer]);

  // Selection change listener with debounce
  React.useEffect(() => {
    if (!canAnnotate) return;

    let timer: NodeJS.Timeout;

    const handleSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // While a form is open the selection normally stays put. The one
        // exception: an empty Ask input follows a new selection, so "Add to
        // queue" can be used on one passage after another.
        const editing = mode !== "idle";
        if (editing && !(mode === "ask" && askTextRef.current === "")) {
          return;
        }
        const dismiss = () => {
          if (editing) return;
          setIsVisible(false);
          setActiveRange(null);
        };

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          dismiss();
          return;
        }

        const range = sel.getRangeAt(0);
        const text = sel.toString().trim();

        // Length validation: 3 to 1000 characters
        if (text.length < 3 || text.length > 1000) {
          dismiss();
          return;
        }

        const startEl =
          range.startContainer.nodeType === 1
            ? (range.startContainer as Element)
            : range.startContainer.parentElement;
        const endEl =
          range.endContainer.nodeType === 1
            ? (range.endContainer as Element)
            : range.endContainer.parentElement;

        if (
          startEl?.closest("[data-annot-ignore]") ||
          endEl?.closest("[data-annot-ignore]")
        ) {
          dismiss();
          return;
        }

        const startRoot = startEl?.closest("[data-annot-root]") as HTMLElement | null;
        const endRoot = endEl?.closest("[data-annot-root]") as HTMLElement | null;

        if (!startRoot || !endRoot || startRoot !== endRoot) {
          dismiss();
          return;
        }

        const targetType = (startRoot.getAttribute("data-annot-target-type") ||
          "RESPONSE_VERSION") as SelectionTargetMetadata["targetType"];

        const targetId =
          startRoot.getAttribute("data-annot-target-id") ||
          startRoot.getAttribute("data-version-id") ||
          "";

        const responseId = startRoot.getAttribute("data-response-id") || "";
        const versionId =
          startRoot.getAttribute("data-version-id") ||
          (targetType === "RESPONSE_VERSION" ? targetId : undefined);

        const depthAttr = startRoot.getAttribute("data-annot-depth");
        const depth = depthAttr ? parseInt(depthAttr, 10) : 0;

        const contentSource =
          ((startRoot.getAttribute("data-annot-content-source") ||
            startRoot.getAttribute("data-content-source")) as "ORIGINAL" | "EDIT") ||
          "ORIGINAL";
        const revAttr =
          startRoot.getAttribute("data-annot-edit-revision") ||
          startRoot.getAttribute("data-edit-revision");
        const editRevision = revAttr ? parseInt(revAttr, 10) : undefined;
        const workspaceId =
          startRoot.closest("[data-workspace-id]")?.getAttribute("data-workspace-id") ||
          workspaceIdProp;

        const columnAttr = startRoot
          .closest("[data-thread-column-index]")
          ?.getAttribute("data-thread-column-index");
        const columnIndex = columnAttr ? parseInt(columnAttr, 10) || 0 : 0;

        const anchor = selectionToAnchor(startRoot, range);

        setActiveRange(range);
        setActiveAnchor(anchor);
        setMetadata({
          targetType,
          targetId,
          responseId,
          versionId,
          depth,
          contentSource,
          editRevision,
          workspaceId,
          columnIndex,
          unsaved: startRoot.getAttribute("data-annot-unsaved") === "true",
        });
        setIsVisible(true);
      }, 120);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [canAnnotate, mode, workspaceIdProp]);

  // Focus input when entering mode
  React.useEffect(() => {
    if (mode === "comment") {
      setCommentText("");
      setTimeout(() => commentInputRef.current?.focus(), 50);
    } else if (mode === "ask") {
      setAskText("");
      setTimeout(() => askInputRef.current?.focus(), 50);
    }
  }, [mode]);

  // Keyboard shortcuts: Ctrl/Cmd + Alt + M (Comment), + A (Ask)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible && mode === "idle") return;

      if (e.key === "Escape") {
        e.preventDefault();
        if (mode !== "idle") {
          setMode("idle");
        } else {
          setIsVisible(false);
        }
        return;
      }

      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.altKey && !metadata?.unsaved) {
        // `e.code`, because Alt changes `e.key` on macOS (⌥M → "µ").
        if (e.code === "KeyM" && effectiveCanComment) {
          e.preventDefault();
          setMode("comment");
        } else if (
          e.code === "KeyA" &&
          effectiveCanAsk &&
          !isOutOfCredits &&
          (!metadata || metadata.depth + 1 <= MAX_ANNOTATION_DEPTH)
        ) {
          e.preventDefault();
          setMode("ask");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, mode, effectiveCanComment, effectiveCanAsk, isOutOfCredits, metadata, isMac]);

  // Action 1: Save comment
  const handleSaveComment = async () => {
    if (!commentText.trim() || !activeAnchor || !metadata) return;

    try {
      setIsSubmitting(true);
      const endpoint =
        metadata.targetType === "ANNOTATION_MESSAGE"
          ? `/api/v1/annotation-messages/${metadata.targetId}/annotations`
          : `/api/v1/response-versions/${metadata.targetId || metadata.versionId}/annotations`;

      const text = commentText.trim();
      const res = await api(endpoint, {
        method: "POST",
        json: {
          kind: "COMMENT",
          anchor: activeAnchor,
          contentSource: metadata.contentSource,
          editRevision: metadata.editRevision,
          text,
        },
      });

      // `@klecx` records a note; no answer is generated.
      const notedByKlecx = /(^|[\s(])@klecx\b/i.test(text);
      toast.success(
        t("commentAdded"),
        notedByKlecx ? { description: tNotes("chip") } : undefined
      );
      setAnnouncement(t("commentAdded"));
      onCommentCreated?.(res);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("annotation-changed", {
            detail: {
              responseId: metadata.responseId,
              versionId: metadata.versionId,
              targetId: metadata.targetId,
              targetType: metadata.targetType,
            },
          })
        );
      }

      setIsVisible(false);
      setMode("idle");
      window.getSelection()?.removeAllRanges();
    } catch {
      toast.error(t("commentFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action 2: Save Ask ("now" or "queue")
  const handleSaveAsk = async (askMode: "now" | "queue") => {
    if (!askText.trim() || !activeAnchor || !metadata) return;

    try {
      setIsSubmitting(true);
      const endpoint =
        metadata.targetType === "ANNOTATION_MESSAGE"
          ? `/api/v1/annotation-messages/${metadata.targetId}/annotations`
          : `/api/v1/response-versions/${metadata.targetId || metadata.versionId}/annotations`;

      const res = await api(endpoint, {
        method: "POST",
        json: {
          kind: "ASK",
          mode: askMode,
          anchor: activeAnchor,
          contentSource: metadata.contentSource,
          editRevision: metadata.editRevision,
          text: askText.trim(),
        },
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("annotation-changed", {
            detail: {
              responseId: metadata.responseId,
              versionId: metadata.versionId,
              targetId: metadata.targetId,
              targetType: metadata.targetType,
            },
          })
        );
      }

      const changedDetail = {
        responseId: metadata.responseId,
        versionId: metadata.versionId,
        targetId: metadata.targetId,
        targetType: metadata.targetType,
      };

      if (askMode === "queue") {
        // Show the real queue size (it survives reloads and includes
        // questions queued elsewhere). If it can't be loaded, fall back to
        // the number added from this toolbar.
        let nextCount = questionQueueCount + 1;
        if (metadata.workspaceId) {
          try {
            const queued = await api<unknown[]>(
              `/api/v1/workspaces/${metadata.workspaceId}/questions?state=QUEUED`
            );
            if (Array.isArray(queued)) nextCount = Math.max(queued.length, 1);
          } catch {
            // keep the local count
          }
        }
        setQuestionQueueCount(nextCount);
        toast.success(t("addedToQueue", { count: nextCount }));
        setAnnouncement(t("addedToQueueAnnouncement", { count: nextCount }));
        onQuestionCreated?.(res);

        // Stay open with an empty input: the next selection re-anchors the
        // popover (see the selection listener), so several passages can be
        // queued in a row.
        setAskText("");
        askInputRef.current?.focus();
      } else {
        // "now": the Ask opens as the column right after the one the text
        // was selected in (0 = main conversation), and its answer streams
        // into that column.
        const created = res as { id?: string };
        if (created?.id) {
          useThreadStackStore
            .getState()
            .open(
              { kind: "annotation", id: created.id },
              { fromIndex: metadata.columnIndex }
            );
          // A failed answer is reported in the column, with a retry button.
          void streamAskAnswer(created.id, { detail: changedDetail });
        }
        onAskNow?.(res);

        onReplyTriggered?.({
          anchor: activeAnchor,
          prompt: askText.trim(),
          responseId: metadata.responseId || "",
          versionId: metadata.versionId || metadata.targetId,
          contentSource: metadata.contentSource,
          editRevision: metadata.editRevision,
        });

        setIsVisible(false);
        setMode("idle");
        window.getSelection()?.removeAllRanges();
      }
    } catch {
      toast.error(t("askFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible && mode === "idle") {
    return null;
  }

  // Calculate gate reasons
  const commentGateReason: GateReason | null = !effectiveCanComment
    ? { code: "no_permission", capability: "comment" }
    : null;

  const askGateReason: GateReason | null = !effectiveCanAsk
    ? { code: "no_permission", capability: "ask" }
    : metadata && metadata.depth + 1 > MAX_ANNOTATION_DEPTH
    ? { code: "max_depth", depth: MAX_ANNOTATION_DEPTH }
    : null;
  const askDisabled = Boolean(askGateReason) || isOutOfCredits;

  const quoteSnippet = activeAnchor?.exact
    ? activeAnchor.exact.length > 60
      ? `${activeAnchor.exact.slice(0, 60)}…`
      : activeAnchor.exact
    : "";

  return (
    <TooltipProvider>
      <div
        ref={popoverRef}
        role="toolbar"
        aria-label={t("actionsAriaLabel")}
        data-testid="selection-toolbar"
        className={cn(
          "z-50 bg-surface border border-border shadow-md transition-all duration-150",
          isCoarsePointer
            ? "fixed inset-x-0 bottom-0 rounded-t-2xl p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
            : "fixed rounded-xl p-1.5"
        )}
      >
        {/* Screen reader polite announcement */}
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {/* Unsaved text: nothing can be anchored to it yet. */}
        {mode === "idle" && metadata?.unsaved && (
          <p
            role="status"
            data-testid="selection-unsaved-note"
            className="max-w-64 px-2 py-1 text-xs text-fg-muted"
          >
            {t("saveChangesFirst")}
          </p>
        )}

        {/* 1. Idle Toolbar Buttons */}
        {mode === "idle" && !metadata?.unsaved && (
          <div className="flex items-center gap-1">
            {/* Comment */}
            <Gated reason={commentGateReason}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="action-comment"
                aria-label={t("comment")}
                disabled={!effectiveCanComment}
                onClick={() => setMode("comment")}
                className={cn(
                  "h-8 px-2.5 text-xs text-fg hover:text-accent hover:bg-surface-2 gap-1.5 font-medium",
                  isCoarsePointer && "min-h-[44px] min-w-[44px] px-3.5",
                  !effectiveCanComment && "opacity-50 cursor-not-allowed"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{t("comment")}</span>
                <kbd className="hidden sm:inline-block ml-1 text-[10px] text-fg-muted font-mono opacity-60">
                  {isMac ? "⌥⌘M" : "Ctrl+Alt+M"}
                </kbd>
              </Button>
            </Gated>

            {/* Ask (replaces Reply & Question) */}
            <Gated reason={askGateReason}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="action-ask"
                aria-label={t("ask")}
                disabled={askDisabled}
                title={!askGateReason && isOutOfCredits ? t("outOfCredits") : undefined}
                onClick={() => setMode("ask")}
                className={cn(
                  "h-8 px-2.5 text-xs text-fg hover:text-accent hover:bg-surface-2 gap-1.5 font-medium",
                  isCoarsePointer && "min-h-[44px] min-w-[44px] px-3.5",
                  askDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{t("ask")}</span>
                <kbd className="hidden sm:inline-block ml-1 text-[10px] text-fg-muted font-mono opacity-60">
                  {isMac ? "⌥⌘A" : "Ctrl+Alt+A"}
                </kbd>
              </Button>
            </Gated>
          </div>
        )}

        {/* 2. Inline Comment Form */}
        {mode === "comment" && (
          <div className="w-72 sm:w-80 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-fg-muted pb-1 border-b border-border/60">
              <span className="font-medium truncate max-w-[200px]">
                «{quoteSnippet}»
              </span>
              <button
                type="button"
                data-testid="comment-cancel-icon"
                aria-label={t("cancel")}
                onClick={() => setMode("idle")}
                className="text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <MentionTextarea
              ref={commentInputRef}
              data-testid="comment-textarea"
              aria-label={t("commentAriaLabel")}
              placeholder={t("commentPlaceholder")}
              value={commentText}
              onChange={setCommentText}
              workspaceId={metadata?.workspaceId}
              canAskOrGenerate={effectiveCanAsk}
              onEnterSubmit={handleSaveComment}
              onCancel={() => setMode("idle")}
              hint={t("mentionHint")}
              rows={2}
            />
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="comment-cancel"
                onClick={() => setMode("idle")}
                className={cn("h-7 px-2.5 text-xs", isCoarsePointer && "min-h-[44px]")}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="comment-save"
                disabled={!commentText.trim() || isSubmitting}
                onClick={handleSaveComment}
                className={cn(
                  "h-7 px-3 text-xs bg-accent text-accent-fg hover:bg-accent-hover font-medium",
                  isCoarsePointer && "min-h-[44px]"
                )}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        )}

        {/* 3. Inline Ask Form */}
        {mode === "ask" && (
          <div className="w-72 sm:w-88 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-fg-muted pb-1 border-b border-border/60">
              <span className="font-medium truncate max-w-[200px]">
                «{quoteSnippet}»
              </span>
              <button
                type="button"
                data-testid="ask-cancel-icon"
                aria-label={t("cancel")}
                onClick={() => setMode("idle")}
                className="text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              ref={askInputRef}
              type="text"
              data-testid="ask-input"
              aria-label={t("askAriaLabel")}
              placeholder={t("askPlaceholder")}
              maxLength={500}
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSaveAsk("queue");
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveAsk("now");
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setMode("idle");
                }
              }}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="ask-cancel"
                onClick={() => setMode("idle")}
                className={cn("h-7 px-2 text-xs", isCoarsePointer && "min-h-[44px]")}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="action-add-to-queue"
                disabled={!askText.trim() || isSubmitting}
                onClick={() => handleSaveAsk("queue")}
                className={cn(
                  "h-7 px-2.5 text-xs border-border text-fg hover:bg-surface-2",
                  isCoarsePointer && "min-h-[44px]"
                )}
              >
                {t("addToQueue")}
                <kbd className="hidden sm:inline-block ml-1 text-[9px] text-fg-muted font-mono opacity-60">
                  {isMac ? "⌘↵" : "Ctrl+↵"}
                </kbd>
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="action-ask-now"
                disabled={!askText.trim() || isSubmitting}
                onClick={() => handleSaveAsk("now")}
                className={cn(
                  "h-7 px-3 text-xs bg-accent text-accent-fg hover:bg-accent-hover font-medium",
                  isCoarsePointer && "min-h-[44px]"
                )}
              >
                <Send className="h-3 w-3 mr-1" />
                {t("askNow")}
                <kbd className="hidden sm:inline-block ml-1 text-[9px] text-accent-fg/80 font-mono">
                  ↵
                </kbd>
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
