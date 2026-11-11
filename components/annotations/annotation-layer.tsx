"use client";

import * as React from "react";
import {
  MessageSquare,
  CornerDownRight,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Clock,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { useUiStore } from "@/lib/stores/ui";
import { anchorToRange, isQueuedAsk, textNodes } from "@/lib/annotations/anchor";
import {
  applyCustomHighlights,
  clearCustomHighlights,
  setHoverHighlight,
  clearHoverHighlight,
  getPointCaret,
  isPointInRange,
  isCustomHighlightSupported,
  getFallbackHighlightRects,
  type HighlightRect,
  type HighlightKind,
} from "@/lib/annotations/highlight";
import type { AnnotationItem } from "./right-panel";
import { cn } from "@/lib/utils";

/**
 * How an annotation is drawn in the preview/gutter.
 */
type DisplayKind = "COMMENT" | "REPLY" | "QUESTION" | "AI_REVIEW";
function isAiReview(a: Pick<AnnotationItem, "authorType">): boolean {
  return a.authorType === "AI";
}

function hasKlecxNote(a: Pick<AnnotationItem, "note" | "notes" | "messages">): boolean {
  if (a.note && (!a.note.status || a.note.status === "ACTIVE")) {
    return true;
  }
  if (a.notes && a.notes.some((n) => !n.status || n.status === "ACTIVE")) {
    return true;
  }
  return Boolean(
    a.messages?.some(
      (m) =>
        m.mentions?.some((x) => x.isKlecx) ||
        /(?:^|[\s(])@klecx\b/i.test(m.content)
    )
  );
}

function displayKind(
  a: Pick<AnnotationItem, "kind" | "questionState" | "authorType">
): DisplayKind {
  if (isAiReview(a)) return "AI_REVIEW";
  if (a.kind === "COMMENT") return "COMMENT";
  return isQueuedAsk(a) ? "QUESTION" : "REPLY";
}

function highlightKindFor(
  a: Pick<AnnotationItem, "kind" | "authorType">
): HighlightKind {
  if (isAiReview(a)) return "AI_REVIEW";
  return a.kind === "ASK" ? "ASK" : "COMMENT";
}

/** Tiny Klecx 'e' SVG mark matching components/logo/Logo.tsx. */
function KlecxLogoDot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-2.5 w-2.5", className)}
      aria-hidden="true"
    >
      <path
        d="M 60 36 H 37 V 63.5 H 91.75 V 8.25 H 8.25 V 91.75 H 91.75"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export interface AnnotationLayerProps {
  /** Main response: its annotations are loaded by response (and version). */
  responseId?: string;
  versionId?: string;
  /** Ask answer: the annotations made on this ASSISTANT message are loaded. */
  messageId?: string;
  content: string;
  annotations?: AnnotationItem[];
  children: React.ReactNode;
  className?: string;
}

interface ActiveAnnotationItem {
  annot: AnnotationItem;
  range: Range;
  blockEl?: HTMLElement | null;
}

interface GutterDot {
  id: string;
  top: number;
  count: number;
  primaryKind: DisplayKind;
  hasKlecxNote: boolean;
  annotations: AnnotationItem[];
  firstRange: Range;
}

function formatRelativeTime(raw?: string | Date | null): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getSafeRangeRect(
  range?: Range | null,
  fallbackEl?: HTMLElement | null
): DOMRect {
  if (range && typeof range.getBoundingClientRect === "function") {
    try {
      const r = range.getBoundingClientRect();
      if (r) return r;
    } catch {}
  }
  if (fallbackEl && typeof fallbackEl.getBoundingClientRect === "function") {
    try {
      const r = fallbackEl.getBoundingClientRect();
      if (r) return r;
    } catch {}
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
    toJSON: () => {},
  } as DOMRect;
}

function truncateText(text: string, maxLen = 140): string {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

function firstLineText(annot: AnnotationItem, maxLen = 140): string {
  const raw = annot.messages?.[0]?.content || annot.anchorExact || "";
  const firstLine = raw.trim().split(/\r?\n/)[0]?.trim() || raw.trim();
  return truncateText(firstLine, maxLen);
}

function authorLabel(annot: AnnotationItem): string {
  if (isAiReview(annot)) {
    return annot.createdBy?.name || "Klecx AI";
  }
  const msgAuthor = annot.messages?.[0]?.author;
  return (
    msgAuthor?.name ||
    msgAuthor?.email ||
    annot.createdBy?.name ||
    annot.createdBy?.email ||
    "User"
  );
}

function renderKindIcon(dk: DisplayKind, className = "h-3.5 w-3.5 text-accent") {
  if (dk === "AI_REVIEW") return <Bot className={cn("h-3.5 w-3.5 text-warning", className)} />;
  if (dk === "REPLY") return <CornerDownRight className={className} />;
  if (dk === "QUESTION") return <HelpCircle className={className} />;
  return <MessageSquare className={className} />;
}

const PREVIEW_LIMIT = 5;

export function AnnotationLayer({
  responseId,
  versionId,
  messageId,
  content,
  annotations: propAnnotations,
  children,
  className,
}: AnnotationLayerProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Each layer owns its highlights; see lib/annotations/highlight-registry.ts.
  const highlightOwner = React.useId();
  const [internalAnnotations, setInternalAnnotations] = React.useState<
    AnnotationItem[]
  >([]);
  const [fallbackRects, setFallbackRects] = React.useState<
    Array<HighlightRect & { kind: DisplayKind }>
  >([]);
  const [gutterDots, setGutterDots] = React.useState<GutterDot[]>([]);

  // Hover & Popover state
  const [activePreview, setActivePreview] = React.useState<{
    annotation: AnnotationItem;
    range: Range;
    allMatching: AnnotationItem[];
    anchorRect?: DOMRect | null;
  } | null>(null);

  const activeRangeItemsRef = React.useRef<ActiveAnnotationItem[]>([]);
  const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const dismissTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingHoverIdRef = React.useRef<string | null>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const isOverPopoverRef = React.useRef(false);

  // 1. Fetch annotations if not provided via props
  const fetchAnnotations = React.useCallback(async () => {
    if (propAnnotations || (!responseId && !messageId)) return;
    try {
      const url = messageId
        ? `/api/v1/annotation-messages/${messageId}/annotations`
        : versionId
        ? `/api/v1/responses/${responseId}/annotations?versionId=${versionId}`
        : `/api/v1/responses/${responseId}/annotations`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];
        setInternalAnnotations(items);
      }
    } catch {
      // Ignore network errors in polling
    }
  }, [propAnnotations, responseId, versionId, messageId]);

  React.useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  // Listen to cross-component annotation mutations
  React.useEffect(() => {
    const handleAnnotationChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      // A layer on an Ask answer can't tell from the event whether it is
      // concerned, so it always reloads.
      if (
        messageId ||
        !detail?.responseId ||
        detail.responseId === responseId
      ) {
        fetchAnnotations();
      }
    };
    window.addEventListener("annotation-changed", handleAnnotationChanged);
    return () => {
      window.removeEventListener("annotation-changed", handleAnnotationChanged);
    };
  }, [responseId, messageId, fetchAnnotations]);

  const annotations = propAnnotations ?? internalAnnotations;

  // 2. Compute DOM Ranges and apply CSS Custom Highlights
  const computeRanges = React.useCallback(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    // Cap at 200 highlights per response (§6.6 performance requirement)
    const capped = annotations
      .filter((a) => !a.resolvedAt && !a.detachedAt)
      .slice(0, 200);

    const nodes = textNodes(rootEl);
    const full = nodes.map((n) => n.data).join("");
    const textCache = { nodes, full };

    const activeItems: ActiveAnnotationItem[] = [];
    const commentRanges: Range[] = [];
    const askRanges: Range[] = [];
    const aiReviewRanges: Range[] = [];
    const fallbackList: Array<HighlightRect & { kind: DisplayKind }> = [];
    const customSupported = isCustomHighlightSupported();

    // Map block elements for accessible gutter indicators
    const blockGroups = new Map<
      HTMLElement,
      { items: ActiveAnnotationItem[] }
    >();

    for (const annot of capped) {
      if (!annot.anchorExact) continue;

      const range = anchorToRange(
        rootEl,
        {
          exact: annot.anchorExact,
          prefix: annot.anchorPrefix ?? "",
          suffix: annot.anchorSuffix ?? "",
          start: (annot as unknown as { anchorStart?: number }).anchorStart ?? 0,
          end: (annot as unknown as { anchorEnd?: number }).anchorEnd ?? 0,
        },
        textCache
      );

      if (!range) continue;

      // Identify containing block element
      const containerNode = range.startContainer;
      const el =
        containerNode.nodeType === 1
          ? (containerNode as HTMLElement)
          : containerNode.parentElement;
      const blockEl =
        (el?.closest(
          "p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, table, div"
        ) as HTMLElement | null) ?? el;

      const item: ActiveAnnotationItem = { annot, range, blockEl };
      activeItems.push(item);

      const hk = highlightKindFor(annot);
      if (hk === "AI_REVIEW") {
        aiReviewRanges.push(range);
      } else if (hk === "ASK") {
        askRanges.push(range);
      } else {
        commentRanges.push(range);
      }

      if (blockEl) {
        const group = blockGroups.get(blockEl) ?? { items: [] };
        group.items.push(item);
        blockGroups.set(blockEl, group);
      }

      // Compute fallback rects if Custom Highlight API is not supported
      if (!customSupported) {
        const dk = displayKind(annot);
        const rects = getFallbackHighlightRects(range, rootEl);
        for (const r of rects) {
          fallbackList.push({ ...r, kind: dk });
        }
      }
    }

    activeRangeItemsRef.current = activeItems;
    setFallbackRects(fallbackList);

    // Apply CSS Custom Highlights via shared multi-root registry
    applyCustomHighlights(
      [
        { kind: "COMMENT", ranges: commentRanges },
        { kind: "AI_REVIEW", ranges: aiReviewRanges },
        { kind: "ASK", ranges: askRanges },
      ],
      highlightOwner
    );

    // Compute gutter dot positions
    const rootRect =
      typeof rootEl.getBoundingClientRect === "function"
        ? rootEl.getBoundingClientRect()
        : { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
    const dots: GutterDot[] = [];
    let dotIdx = 0;

    blockGroups.forEach((group, blockEl) => {
      const blockRect =
        typeof blockEl.getBoundingClientRect === "function"
          ? blockEl.getBoundingClientRect()
          : { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
      const top = Math.max(8, blockRect.top - rootRect.top + 10);

      // Sort items by priority: reply (4) > question (3) > ai_review (2) > comment (1)
      const sortedItems = [...group.items].sort((a, b) => {
        const kA = displayKind(a.annot);
        const kB = displayKind(b.annot);
        const rank = (k: DisplayKind) =>
          k === "REPLY" ? 4 : k === "QUESTION" ? 3 : k === "AI_REVIEW" ? 2 : 1;
        return rank(kB) - rank(kA);
      });

      const annotsInBlock = sortedItems.map((i) => i.annot);
      const topItem = sortedItems[0]!;

      dots.push({
        id: `gutter-dot-${dotIdx++}`,
        top,
        count: annotsInBlock.length,
        primaryKind: displayKind(topItem.annot),
        hasKlecxNote: annotsInBlock.some(hasKlecxNote),
        annotations: annotsInBlock,
        firstRange: topItem.range,
      });
    });

    setGutterDots(dots);
  }, [annotations, highlightOwner]);

  // Recompute when annotations or content change
  React.useEffect(() => {
    computeRanges();
    return () => {
      clearCustomHighlights(highlightOwner);
    };
  }, [computeRanges, content, highlightOwner]);

  // Recompute on container resize (ResizeObserver)
  React.useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      computeRanges();
    });
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [computeRanges]);

  // 3. Hover detection (pointermove, 250ms debounce, throttled via requestAnimationFrame)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    const clientX = e.clientX;
    const clientY = e.clientY;

    rafIdRef.current = requestAnimationFrame(() => {
      const rootEl = rootRef.current;
      if (!rootEl) return;

      const caret = getPointCaret(document, clientX, clientY);
      if (!caret) return;

      const matches: { annot: AnnotationItem; range: Range }[] = [];
      for (const item of activeRangeItemsRef.current) {
        if (isPointInRange(item.range, caret.node, caret.offset)) {
          matches.push({ annot: item.annot, range: item.range });
        }
      }

      if (matches.length > 0) {
        const PRIORITY: Record<DisplayKind, number> = {
          REPLY: 4,
          QUESTION: 3,
          AI_REVIEW: 2,
          COMMENT: 1,
        };
        matches.sort(
          (a, b) =>
            (PRIORITY[displayKind(b.annot)] ?? 0) -
            (PRIORITY[displayKind(a.annot)] ?? 0)
        );
        const topMatch = matches[0]!;

        if (pendingHoverIdRef.current === topMatch.annot.id) {
          return;
        }

        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        pendingHoverIdRef.current = topMatch.annot.id;

        hoverTimerRef.current = setTimeout(() => {
          const rect = getSafeRangeRect(topMatch.range, rootEl);
          setActivePreview({
            annotation: topMatch.annot,
            range: topMatch.range,
            allMatching: matches.map((m) => m.annot),
            anchorRect: rect,
          });
          setHoverHighlight(topMatch.range);
        }, 250);
      } else {
        pendingHoverIdRef.current = null;
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }

        if (!isOverPopoverRef.current && activePreview) {
          if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = setTimeout(() => {
            if (!isOverPopoverRef.current) {
              setActivePreview(null);
              clearHoverHighlight();
            }
          }, 150);
        }
      }
    });
  };

  const handlePointerLeave = () => {
    pendingHoverIdRef.current = null;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!isOverPopoverRef.current && activePreview) {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        if (!isOverPopoverRef.current) {
          setActivePreview(null);
          clearHoverHighlight();
        }
      }, 150);
    }
  };

  // Keyboard Escape listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activePreview) {
        setActivePreview(null);
        clearHoverHighlight();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePreview]);

  // Clean up timers on unmount
  React.useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      clearHoverHighlight();
      clearCustomHighlights(highlightOwner);
    };
  }, [highlightOwner]);

  // 4. Action: "View" / "View more" opens the annotation's column right after
  // the column this text sits in (0 = main conversation, 1 = L1, 2 = L2...).
  const handleViewMore = (annot: AnnotationItem) => {
    const columnAttr = rootRef.current
      ?.closest("[data-thread-column-index]")
      ?.getAttribute("data-thread-column-index");
    const fromIndex = columnAttr ? parseInt(columnAttr, 10) || 0 : 0;
    const store = useThreadStackStore.getState();
    store.rememberQuotes([{ id: annot.id, quote: annot.anchorExact }]);
    store.open({ kind: "annotation", id: annot.id }, { fromIndex });
    setActivePreview(null);
    clearHoverHighlight();
  };

  const handleViewAllInDrawer = () => {
    useUiStore.getState().setRightPanelOpen(true);
    setActivePreview(null);
    clearHoverHighlight();
  };

  // 5. Gutter dot click / focus / keyboard activator
  const handleGutterDotActivate = (dot: GutterDot) => {
    const annot = dot.annotations[0]!;
    const rect = getSafeRangeRect(dot.firstRange, rootRef.current);
    setActivePreview({
      annotation: annot,
      range: dot.firstRange,
      allMatching: dot.annotations,
      anchorRect: rect,
    });
    setHoverHighlight(dot.firstRange);
  };

  const targetAnnot = activePreview?.annotation;
  const kind = targetAnnot ? displayKind(targetAnnot) : undefined;
  const visibleAnnotations = activePreview?.allMatching.slice(0, PREVIEW_LIMIT) ?? [];
  const extraAnnotations = visibleAnnotations.slice(1);
  const hasOverflow =
    (activePreview?.allMatching.length ?? 0) > PREVIEW_LIMIT;

  const commentMessage =
    targetAnnot?.messages && targetAnnot.messages.length > 0
      ? targetAnnot.messages[0]
      : null;
  const commentText = commentMessage?.content || targetAnnot?.anchorExact || "";
  const authorName = targetAnnot ? authorLabel(targetAnnot) : "User";

  const replyUserMsg =
    targetAnnot?.messages?.find((m) => m.role === "USER") ||
    targetAnnot?.messages?.[0];
  const replyAssistantMsg = targetAnnot?.messages?.find(
    (m) => m.role === "ASSISTANT"
  );
  const replyPromptText = replyUserMsg?.content || targetAnnot?.anchorExact || "";

  const allQuestions =
    activePreview?.allMatching?.filter((a) => isQueuedAsk(a)) || [];
  const hasMultipleQuestions = allQuestions.length > 1;

  return (
    <div
      ref={rootRef}
      className={cn("relative group/annot", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Children content (Markdown body) */}
      {children}

      {/* Fallback highlight overlays for environments lacking CSS Custom Highlight API */}
      {!isCustomHighlightSupported() && fallbackRects.length > 0 && (
        <div
          className="absolute inset-0 pointer-events-none select-none z-0"
          data-annot-ignore="true"
          aria-hidden="true"
        >
          {fallbackRects.map((r, i) => (
            <div
              key={i}
              className={cn(
                "absolute rounded-sm pointer-events-none transition-colors",
                r.kind === "AI_REVIEW"
                  ? "border-b border-dashed border-[var(--warning)]"
                  : r.kind === "REPLY" || r.kind === "QUESTION"
                  ? "bg-[var(--mark-ask)]"
                  : "border-b-2 border-dotted border-[var(--mark-comment)]"
              )}
              style={{
                top: `${r.top}px`,
                left: `${r.left}px`,
                width: `${r.width}px`,
                height: `${r.height}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Touch / Keyboard accessible gutter dots */}
      {gutterDots.length > 0 && (
        <div
          className="absolute right-0 top-0 bottom-0 pointer-events-none select-none z-10"
          data-annot-ignore="true"
        >
          {gutterDots.map((dot) => (
            <button
              key={dot.id}
              type="button"
              role="button"
              tabIndex={0}
              data-annot-ignore="true"
              data-testid="gutter-dot"
              aria-label={`${dot.count} annotation${dot.count > 1 ? "s" : ""} on this paragraph`}
              className="pointer-events-auto absolute -right-2 sm:-right-4 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-surface border border-border shadow-sm hover:border-accent hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all cursor-pointer"
              style={{ top: `${dot.top}px` }}
              onClick={() => handleGutterDotActivate(dot)}
              onFocus={() => handleGutterDotActivate(dot)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleGutterDotActivate(dot);
                }
              }}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  dot.primaryKind === "REPLY"
                    ? "bg-accent"
                    : dot.primaryKind === "QUESTION"
                    ? "bg-info"
                    : "bg-warning"
                )}
              />
              {dot.hasKlecxNote && (
                <span
                  data-testid="gutter-klecx-mark"
                  title="Klecx noted this"
                  className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-surface border border-accent/40 text-accent shadow-xs"
                >
                  <KlecxLogoDot className="h-2 w-2" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Popover Preview Card */}
      <Popover
        open={!!activePreview}
        onOpenChange={(open) => {
          if (!open) {
            setActivePreview(null);
            clearHoverHighlight();
          }
        }}
      >
        {/* Invisible positioning anchor */}
        <PopoverAnchor asChild>
          <div
            style={
              activePreview?.anchorRect
                ? {
                    position: "fixed",
                    top: activePreview.anchorRect.top,
                    left: activePreview.anchorRect.left,
                    width: Math.max(1, activePreview.anchorRect.width),
                    height: Math.max(1, activePreview.anchorRect.height),
                    pointerEvents: "none",
                  }
                : { display: "none" }
            }
          />
        </PopoverAnchor>

        <PopoverContent
          role="dialog"
          aria-label="Annotation preview"
          side="top"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={() => {
            isOverPopoverRef.current = true;
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
          }}
          onPointerLeave={() => {
            isOverPopoverRef.current = false;
            setActivePreview(null);
            clearHoverHighlight();
          }}
          className="z-50 w-72 rounded-xl border border-border bg-surface p-3 text-fg shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          {targetAnnot && (
            <div className="space-y-2.5 text-xs">
              {/* Header: Kind, Author, Klecx Note Indicator, Timestamp */}
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <div className="flex items-center gap-1.5 font-medium text-fg min-w-0">
                  {kind === "COMMENT" && (
                    <>
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate max-w-[120px]">{authorName}</span>
                    </>
                  )}
                  {kind === "AI_REVIEW" && (
                    <>
                      <Bot className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="truncate max-w-[110px]">{authorName}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-warning bg-surface-2 px-1.5 py-0.5 rounded border border-border font-medium">
                        AI review
                      </span>
                    </>
                  )}
                  {kind === "REPLY" && (
                    <>
                      <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate max-w-[110px]">{authorName}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-accent bg-accent-soft px-1.5 py-0.5 rounded font-medium">
                        <Sparkles className="h-2.5 w-2.5" /> AI replied
                      </span>
                    </>
                  )}
                  {kind === "QUESTION" && (
                    <>
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate max-w-[90px]">{authorName}</span>
                      {targetAnnot.questionState && (
                        <span className="text-[10px] uppercase font-semibold text-fg-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border">
                          {targetAnnot.questionState}
                        </span>
                      )}
                    </>
                  )}
                  {hasKlecxNote(targetAnnot) && (
                    <span
                      data-testid="preview-klecx-badge"
                      className="inline-flex items-center gap-0.5 text-[10px] text-accent bg-accent-soft px-1 py-0.5 rounded font-medium shrink-0"
                      title="Klecx noted this"
                    >
                      <KlecxLogoDot className="h-2 w-2" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-fg-subtle shrink-0">
                  <Clock className="h-3 w-3" />
                  <span>{formatRelativeTime(targetAnnot.createdAt)}</span>
                </div>
              </div>

              {/* Body: Preview Content */}
              {(kind === "COMMENT" || kind === "AI_REVIEW") && (
                <div className="text-fg-muted leading-relaxed">
                  <p className="line-clamp-3 select-text">
                    {truncateText(commentText, 140)}
                  </p>
                </div>
              )}

              {kind === "REPLY" && (
                <div className="space-y-1.5 leading-relaxed">
                  <p className="text-fg-muted line-clamp-2 select-text">
                    {truncateText(replyPromptText, 140)}
                  </p>
                  {replyAssistantMsg && (
                    <p className="text-[11px] text-fg-subtle line-clamp-2 italic select-text border-l-2 border-accent/40 pl-2">
                      {truncateText(replyAssistantMsg.content, 100)}
                    </p>
                  )}
                </div>
              )}

              {kind === "QUESTION" && (
                <div className="space-y-1.5">
                  {hasMultipleQuestions ? (
                    <ol className="list-decimal list-inside space-y-1 text-fg-muted">
                      {allQuestions.map((q) => {
                        const qMsg = q.messages?.[0]?.content || q.anchorExact;
                        return (
                          <li key={q.id} className="text-xs truncate">
                            <span>{truncateText(qMsg, 60)}</span>
                            {q.questionState && (
                              <span className="ml-1 text-[9px] uppercase px-1 py-0.2 bg-surface-2 rounded text-fg-subtle">
                                {q.questionState}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-fg-muted line-clamp-3 select-text">
                      {truncateText(
                        targetAnnot.messages?.[0]?.content ||
                          targetAnnot.anchorExact,
                        140
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Primary "View more" button */}
              <div className="pt-1 border-t border-border flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-accent hover:text-accent-hover hover:bg-accent-soft gap-1"
                  onClick={() => handleViewMore(targetAnnot)}
                >
                  <span>View more</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>

              {/* Additional annotations on this passage (up to 5 total) */}
              {extraAnnotations.length > 0 && (
                <div
                  className="pt-2 border-t border-border space-y-1.5"
                  data-testid="preview-extra-annotations"
                >
                  {extraAnnotations.map((item) => {
                    const dk = displayKind(item);
                    const name = authorLabel(item);
                    return (
                      <div
                        key={item.id}
                        data-testid={`preview-item-${item.id}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-surface-2/60 px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1 text-[11px] text-fg">
                            {renderKindIcon(dk, "h-3 w-3 shrink-0 text-accent")}
                            <span className="font-medium truncate">{name}</span>
                            {hasKlecxNote(item) && (
                              <KlecxLogoDot className="h-2 w-2 text-accent shrink-0" />
                            )}
                            <span className="text-[10px] text-fg-subtle shrink-0">
                              {formatRelativeTime(item.createdAt)}
                            </span>
                          </div>
                          <p className="text-[11px] text-fg-muted truncate">
                            {firstLineText(item, 80)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`View annotation by ${name}`}
                          className="h-6 px-2 text-[11px] text-accent hover:text-accent-hover hover:bg-accent-soft shrink-0"
                          onClick={() => handleViewMore(item)}
                        >
                          View
                        </Button>
                      </div>
                    );
                  })}

                  {hasOverflow && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-[11px] text-fg-muted hover:text-fg"
                      onClick={handleViewAllInDrawer}
                    >
                      View all in drawer ({activePreview?.allMatching.length})
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
