"use client";

import * as React from "react";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import {
  MessageSquare,
  CornerDownLeft,
  HelpCircle,
  X,
  Send,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api/client";
import { useUiStore } from "@/lib/stores/ui";
import { selectionToAnchor, type Anchor } from "@/lib/annotations";
import { cn } from "@/lib/utils";

export type ToolbarMode = "idle" | "comment" | "reply" | "question";

export interface SelectionToolbarProps {
  canAnnotate?: boolean;
  canGenerate?: boolean;
  isOutOfCredits?: boolean;
  onCommentCreated?: (annotation: unknown) => void;
  onQuestionCreated?: (annotation: unknown) => void;
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
  canAnnotate = true,
  canGenerate = true,
  isOutOfCredits = false,
  onCommentCreated,
  onQuestionCreated,
  onReplyTriggered,
}: SelectionToolbarProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [mode, setMode] = React.useState<ToolbarMode>("idle");
  const [activeRange, setActiveRange] = React.useState<Range | null>(null);
  const [activeAnchor, setActiveAnchor] = React.useState<Anchor | null>(null);
  const [metadata, setMetadata] = React.useState<{
    responseId: string;
    versionId: string;
    contentSource: "ORIGINAL" | "EDIT";
    editRevision?: number;
  } | null>(null);

  const [commentText, setCommentText] = React.useState("");
  const [replyText, setReplyText] = React.useState("");
  const [questionText, setQuestionText] = React.useState("");
  const [questionQueueCount, setQuestionQueueCount] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const [isCoarsePointer, setIsCoarsePointer] = React.useState(false);

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const commentInputRef = React.useRef<HTMLTextAreaElement>(null);
  const replyInputRef = React.useRef<HTMLInputElement>(null);
  const questionInputRef = React.useRef<HTMLInputElement>(null);

  const setRightPanelOpen = useUiStore((s) => s.setRightPanelOpen);
  const setRightPanelFocus = useUiStore((s) => s.setRightPanelFocus);

  // Detect coarse pointer (mobile / touch)
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
        // If user is actively typing in an open inline form, do not dismiss on focus switch
        if (mode !== "idle") {
          return;
        }

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setIsVisible(false);
          setActiveRange(null);
          return;
        }

        const range = sel.getRangeAt(0);
        const text = sel.toString().trim();

        // Length validation: 3 to 1000 characters
        if (text.length < 3 || text.length > 1000) {
          setIsVisible(false);
          setActiveRange(null);
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

        // Skip if inside [data-annot-ignore]
        if (
          startEl?.closest("[data-annot-ignore]") ||
          endEl?.closest("[data-annot-ignore]")
        ) {
          setIsVisible(false);
          setActiveRange(null);
          return;
        }

        // Must be inside one [data-annot-root]
        const startRoot = startEl?.closest("[data-annot-root]") as HTMLElement | null;
        const endRoot = endEl?.closest("[data-annot-root]") as HTMLElement | null;

        if (!startRoot || !endRoot || startRoot !== endRoot) {
          setIsVisible(false);
          setActiveRange(null);
          return;
        }

        const responseId = startRoot.getAttribute("data-response-id") || "";
        const versionId = startRoot.getAttribute("data-version-id") || "";
        const contentSource =
          (startRoot.getAttribute("data-content-source") as
            | "ORIGINAL"
            | "EDIT") || "ORIGINAL";
        const revAttr = startRoot.getAttribute("data-edit-revision");
        const editRevision = revAttr ? parseInt(revAttr, 10) : undefined;

        const anchor = selectionToAnchor(startRoot, range);

        setActiveRange(range);
        setActiveAnchor(anchor);
        setMetadata({
          responseId,
          versionId,
          contentSource,
          editRevision,
        });
        setIsVisible(true);
      }, 120);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [canAnnotate, mode]);

  // Reset inputs when switching modes
  React.useEffect(() => {
    if (mode === "comment") {
      setCommentText("");
      setTimeout(() => commentInputRef.current?.focus(), 50);
    } else if (mode === "reply") {
      setReplyText("");
      setTimeout(() => replyInputRef.current?.focus(), 50);
    } else if (mode === "question") {
      setQuestionText("");
      setTimeout(() => questionInputRef.current?.focus(), 50);
    }
  }, [mode]);

  // Keyboard shortcuts: Ctrl/Cmd + Alt + M (Comment), + R (Reply), + Q (Question)
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

      const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && e.altKey) {
        const key = e.key.toLowerCase();
        if (key === "m") {
          e.preventDefault();
          setMode("comment");
        } else if (key === "r" && canGenerate && !isOutOfCredits) {
          e.preventDefault();
          setMode("reply");
        } else if (key === "q") {
          e.preventDefault();
          setMode("question");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, mode, canGenerate, isOutOfCredits]);

  // Action 1: Save comment
  const handleSaveComment = async () => {
    if (!commentText.trim() || !activeAnchor || !metadata?.versionId) return;

    try {
      setIsSubmitting(true);
      const res = await api(
        `/api/v1/response-versions/${metadata.versionId}/annotations`,
        {
          method: "POST",
          json: {
            kind: "COMMENT",
            anchor: activeAnchor,
            contentSource: metadata.contentSource,
            editRevision: metadata.editRevision,
            text: commentText.trim(),
          },
        }
      );

      toast.success("Comment added");
      setAnnouncement("Comment added successfully");
      onCommentCreated?.(res);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("annotation-changed", {
            detail: { responseId: metadata.responseId, versionId: metadata.versionId },
          })
        );
      }

      setIsVisible(false);
      setMode("idle");
      window.getSelection()?.removeAllRanges();
    } catch {
      toast.error("Failed to create comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action 2: Trigger AI reply
  const handleSendReply = () => {
    if (!replyText.trim() || !activeAnchor || !metadata) return;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("annotation-changed", {
          detail: { responseId: metadata.responseId, versionId: metadata.versionId },
        })
      );
    }

    onReplyTriggered?.({
      anchor: activeAnchor,
      prompt: replyText.trim(),
      responseId: metadata.responseId,
      versionId: metadata.versionId,
      contentSource: metadata.contentSource,
      editRevision: metadata.editRevision,
    });

    // Open right panel and set focus
    setRightPanelFocus({
      responseId: metadata.responseId,
      versionId: metadata.versionId,
      tab: "replies",
    });
    setRightPanelOpen(true);

    setIsVisible(false);
    setMode("idle");
    window.getSelection()?.removeAllRanges();
  };

  // Action 3: Add Question to queue
  const handleSaveQuestion = async (keepOpen = false) => {
    if (!questionText.trim() || !activeAnchor || !metadata?.versionId) return;

    try {
      setIsSubmitting(true);
      const res = await api(
        `/api/v1/response-versions/${metadata.versionId}/annotations`,
        {
          method: "POST",
          json: {
            kind: "QUESTION",
            anchor: activeAnchor,
            contentSource: metadata.contentSource,
            editRevision: metadata.editRevision,
            text: questionText.trim(),
          },
        }
      );

      const nextCount = questionQueueCount + 1;
      setQuestionQueueCount(nextCount);
      toast.success(`Added to your queue (${nextCount})`);
      setAnnouncement(`Question added to queue (${nextCount})`);
      onQuestionCreated?.(res);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("annotation-changed", {
            detail: { responseId: metadata.responseId, versionId: metadata.versionId },
          })
        );
      }

      if (keepOpen) {
        setQuestionText("");
        questionInputRef.current?.focus();
      } else {
        setIsVisible(false);
        setMode("idle");
        window.getSelection()?.removeAllRanges();
      }
    } catch {
      toast.error("Failed to add question to queue");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible && mode === "idle") {
    return null;
  }

  // Quote preview snippet (shortened)
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
        aria-label="Annotation actions"
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

        {/* 1. Idle Toolbar Buttons */}
        {mode === "idle" && (
          <div className="flex items-center gap-1">
            {/* Comment */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="action-comment"
              aria-label="Add comment"
              onClick={() => setMode("comment")}
              className={cn(
                "h-8 px-2.5 text-xs text-fg hover:text-accent hover:bg-surface-2 gap-1.5 font-medium",
                isCoarsePointer && "min-h-[44px] min-w-[44px] px-3.5"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Comment</span>
              <kbd className="hidden sm:inline-block ml-1 text-[10px] text-fg-muted font-mono opacity-60">
                ⌥⌘M
              </kbd>
            </Button>

            {/* Reply */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid="action-reply"
                    aria-label="Reply to selection"
                    disabled={!canGenerate || isOutOfCredits}
                    onClick={() => setMode("reply")}
                    className={cn(
                      "h-8 px-2.5 text-xs text-fg hover:text-accent hover:bg-surface-2 gap-1.5 font-medium",
                      isCoarsePointer && "min-h-[44px] min-w-[44px] px-3.5",
                      (!canGenerate || isOutOfCredits) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    <span>Reply</span>
                    <kbd className="hidden sm:inline-block ml-1 text-[10px] text-fg-muted font-mono opacity-60">
                      ⌥⌘R
                    </kbd>
                  </Button>
                </span>
              </TooltipTrigger>
              {(!canGenerate || isOutOfCredits) && (
                <TooltipContent>
                  {!canGenerate
                    ? "Workspace generation permission required"
                    : "Out of credits"}
                </TooltipContent>
              )}
            </Tooltip>

            {/* Question */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="action-question"
              aria-label="Add question"
              onClick={() => setMode("question")}
              className={cn(
                "h-8 px-2.5 text-xs text-fg hover:text-accent hover:bg-surface-2 gap-1.5 font-medium",
                isCoarsePointer && "min-h-[44px] min-w-[44px] px-3.5"
              )}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Add question</span>
              <kbd className="hidden sm:inline-block ml-1 text-[10px] text-fg-muted font-mono opacity-60">
                ⌥⌘Q
              </kbd>
            </Button>
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
                onClick={() => setMode("idle")}
                className="text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              ref={commentInputRef}
              data-testid="comment-textarea"
              aria-label="Comment text"
              placeholder="Add a comment... (Enter to save, Esc to cancel)"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveComment();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setMode("idle");
                }
              }}
              rows={2}
              className="w-full text-xs p-2 rounded-lg border border-border bg-surface-2 text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
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
                Cancel
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
                Save
              </Button>
            </div>
          </div>
        )}

        {/* 3. Inline Reply Form */}
        {mode === "reply" && (
          <div className="w-72 sm:w-84 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-fg-muted pb-1 border-b border-border/60">
              <span className="font-medium truncate max-w-[200px]">
                Reply to «{quoteSnippet}»
              </span>
              <button
                type="button"
                data-testid="reply-cancel-icon"
                onClick={() => setMode("idle")}
                className="text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={replyInputRef}
                type="text"
                data-testid="reply-input"
                aria-label="Reply prompt"
                placeholder="Ask AI about this passage..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendReply();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setMode("idle");
                  }
                }}
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Button
                type="button"
                size="sm"
                data-testid="reply-send"
                disabled={!replyText.trim()}
                onClick={handleSendReply}
                className={cn(
                  "h-8 px-2.5 bg-accent text-accent-fg hover:bg-accent-hover font-medium",
                  isCoarsePointer && "min-h-[44px] min-w-[44px]"
                )}
              >
                <Send className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Send</span>
              </Button>
            </div>
          </div>
        )}

        {/* 4. Inline Question Form */}
        {mode === "question" && (
          <div className="w-72 sm:w-88 p-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-fg-muted pb-1 border-b border-border/60">
              <span className="font-medium truncate max-w-[200px]">
                Question on «{quoteSnippet}»
              </span>
              <button
                type="button"
                data-testid="question-cancel-icon"
                onClick={() => setMode("idle")}
                className="text-fg-muted hover:text-fg p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              ref={questionInputRef}
              type="text"
              data-testid="question-input"
              aria-label="Question text"
              placeholder="Ask a question to queue..."
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveQuestion(false);
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
                data-testid="question-cancel"
                onClick={() => setMode("idle")}
                className={cn("h-7 px-2 text-xs", isCoarsePointer && "min-h-[44px]")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="question-add-another"
                disabled={!questionText.trim() || isSubmitting}
                onClick={() => handleSaveQuestion(true)}
                className={cn(
                  "h-7 px-2 text-xs border-border text-fg hover:bg-surface-2",
                  isCoarsePointer && "min-h-[44px]"
                )}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add & another
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="question-add"
                disabled={!questionText.trim() || isSubmitting}
                onClick={() => handleSaveQuestion(false)}
                className={cn(
                  "h-7 px-3 text-xs bg-accent text-accent-fg hover:bg-accent-hover font-medium",
                  isCoarsePointer && "min-h-[44px]"
                )}
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
