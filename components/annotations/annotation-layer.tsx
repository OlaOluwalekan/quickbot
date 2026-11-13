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
import { useFormatter, useNow, useTranslations } from "next-intl";
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
import type { AnnotationItem } from "./types";
import { QuickFixBlock, ReviewChips, type QuickFixContext } from "./quick-fix";
import { useDocumentDraftsStore } from "@/lib/stores/document-drafts";
import { cn } from "@/lib/utils";

/**
 * How an annotation is drawn in the preview/gutter.
 */
type DisplayKind = "COMMENT" | "REPLY" | "QUESTION" | "AI_REVIEW";
function isAiReview(a: Pick<AnnotationItem, "authorType">): boolean {
  return a.authorType === "AI";
}

function hasKlecxNote(a: Pick<AnnotationItem, "note" | "notes" | "messages">): boolean {
  const active = (n: { status?: string }) => !n.status || n.status === "ACTIVE";
  // The server sends the notes of the annotation: an archived note has no mark.
  if (a.notes) return a.notes.some(active);
  if (a.note) return active(a.note);
  return Boolean(a.messages?.some((m) => m.mentions?.some((x) => x.isKlecx)));
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
  /** Generated document (F3.4): the annotations on this revision are loaded. */
  documentId?: string;
  documentRevision?: number;
  content: string;
  annotations?: AnnotationItem[];
  /**
   * The text quick fixes are applied to (F3.3). With it, the preview card of
   * a review comment shows the change with Accept and Dismiss.
   */
  quickFix?: QuickFixContext;
  /** Called with the annotations of this text whenever they are (re)loaded. */
  onAnnotationsChange?: (annotations: AnnotationItem[]) => void;
  children: React.ReactNode;
  className?: string;
}

interface ActiveAnnotationItem {
  annot: AnnotationItem;
  range: Range;
  blockEl?: HTMLElement | null;
}

/**
 * What the preview card is attached to: the line of the highlight that is
 * under the pointer (`offsetX` = pointer position inside that line), or the
 * gutter dot that opened it.
 */
type PreviewAnchor =
  | { type: "line"; rectIndex: number; offsetX: number }
  | { type: "dot"; el: HTMLElement };

interface ActivePreview {
  annotation: AnnotationItem;
  range: Range;
  allMatching: AnnotationItem[];
  anchor: PreviewAnchor;
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

const EMPTY_RECT = {
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
  return EMPTY_RECT;
}

/** The boxes a highlight is painted in: one per line (and per inline element). */
function rangeLineRects(range: Range): DOMRect[] {
  if (typeof range.getClientRects !== "function") return [];
  try {
    return Array.from(range.getClientRects()).filter(
      (r) => r.width > 0 && r.height > 0
    );
  } catch {
    return [];
  }
}

const HIT_SLOP = 2;

/**
 * Index of the smallest box of `range` that contains the point, `null` when
 * the point is on none of them, or -1 when the range has no boxes to test
 * (no layout). The caret lookup alone is not enough: it returns the *nearest*
 * text position, so empty space next to a highlight would also match.
 */
function hitLineRect(range: Range, x: number, y: number): number | null {
  const rects = rangeLineRects(range);
  if (rects.length === 0) return -1;
  let best: number | null = null;
  let bestArea = Infinity;
  rects.forEach((r, i) => {
    if (
      x >= r.left - HIT_SLOP &&
      x <= r.right + HIT_SLOP &&
      y >= r.top - HIT_SLOP &&
      y <= r.bottom + HIT_SLOP
    ) {
      const area = r.width * r.height;
      if (area < bestArea) {
        best = i;
        bestArea = area;
      }
    }
  });
  return best;
}

/** Where the preview card points at, measured now (it follows scrolling). */
function previewAnchorRect(
  preview: ActivePreview,
  rootEl: HTMLElement | null
): DOMRect {
  if (preview.anchor.type === "dot") {
    return getSafeRangeRect(null, preview.anchor.el);
  }
  const line = rangeLineRects(preview.range)[preview.anchor.rectIndex];
  if (!line) return getSafeRangeRect(preview.range, rootEl);
  const x = Math.min(
    line.right,
    Math.max(line.left, line.left + preview.anchor.offsetX)
  );
  return {
    x,
    y: line.top,
    left: x,
    right: x,
    top: line.top,
    bottom: line.bottom,
    width: 0,
    height: line.height,
    toJSON: () => ({}),
  } as DOMRect;
}

/** True when a DOM change happened only inside UI that is not annotatable text. */
function isIgnoredMutation(m: MutationRecord): boolean {
  const ignored = (n: Node | null): boolean => {
    const el = n && n.nodeType === 1 ? (n as Element) : n?.parentElement;
    return Boolean(el?.closest("[data-annot-ignore]"));
  };
  if (ignored(m.target)) return true;
  if (m.type !== "childList") return false;
  const changed = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
  return (
    changed.length > 0 &&
    changed.every(
      (n) =>
        n.nodeType === 1 && (n as Element).hasAttribute("data-annot-ignore")
    )
  );
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

function authorLabel(
  annot: AnnotationItem,
  labels: { klecx: string; member: string }
): string {
  if (isAiReview(annot)) return labels.klecx;
  const msgAuthor = annot.messages?.[0]?.author;
  return (
    msgAuthor?.name ||
    msgAuthor?.email ||
    annot.createdBy?.name ||
    annot.createdBy?.email ||
    labels.member
  );
}

const DISPLAY_PRIORITY: Record<DisplayKind, number> = {
  REPLY: 4,
  QUESTION: 3,
  AI_REVIEW: 2,
  COMMENT: 1,
};

function renderKindIcon(dk: DisplayKind, className = "h-3.5 w-3.5 text-accent") {
  if (dk === "AI_REVIEW") return <Bot className={cn("h-3.5 w-3.5 text-warning", className)} />;
  if (dk === "REPLY") return <CornerDownRight className={className} />;
  if (dk === "QUESTION") return <HelpCircle className={className} />;
  return <MessageSquare className={className} />;
}

const PREVIEW_LIMIT = 5;
const QUESTION_STATES = new Set([
  "QUEUED",
  "ANSWERING",
  "ANSWERED",
  "FAILED",
  "CANCELLED",
]);

export function AnnotationLayer({
  responseId,
  versionId,
  messageId,
  documentId,
  documentRevision,
  content,
  annotations: propAnnotations,
  quickFix,
  onAnnotationsChange,
  children,
  className,
}: AnnotationLayerProps) {
  const t = useTranslations("Annotations.preview");
  const format = useFormatter();
  const now = useNow();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
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
  const [activePreview, setActivePreview] = React.useState<ActivePreview | null>(
    null
  );

  const activeRangeItemsRef = React.useRef<ActiveAnnotationItem[]>([]);
  const hoverTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const dismissTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  // The passage(s) the pointer is on. While it stays on them the card is not
  // opened again, so a card closed with Escape or a click does not come back.
  const pendingHoverKeyRef = React.useRef<string | null>(null);
  // Set when the card was opened from a gutter dot with the keyboard or a
  // click: focus then moves into the card, and back to the dot on Escape.
  const focusCardRef = React.useRef(false);
  const skipDotFocusRef = React.useRef(false);
  const rafIdRef = React.useRef<number | null>(null);
  const isOverPopoverRef = React.useRef(false);

  // 1. Fetch annotations if not provided via props
  const fetchAnnotations = React.useCallback(async () => {
    if (propAnnotations || (!responseId && !messageId && !documentId)) return;
    try {
      const url = documentId
        ? `/api/v1/documents/${documentId}/revisions/${documentRevision ?? 1}/annotations`
        : messageId
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
  }, [propAnnotations, responseId, versionId, messageId, documentId, documentRevision]);

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
        documentId ||
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
  }, [responseId, messageId, documentId, fetchAnnotations]);

  const annotations = propAnnotations ?? internalAnnotations;

  // Callers pass a stable function (a state setter).
  React.useEffect(() => {
    onAnnotationsChange?.(annotations);
  }, [annotations, onAnnotationsChange]);

  // Quick fixes already put into the unsaved draft: their passage now holds
  // the replacement, so their mark is not drawn (it could land on another
  // occurrence of the old text).
  const appliedFixIds = useDocumentDraftsStore((s) =>
    quickFix ? s.drafts[quickFix.versionId]?.appliedSuggestionIds : undefined
  );

  // 2. Compute DOM Ranges and apply CSS Custom Highlights
  const computeRanges = React.useCallback(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;

    // Cap at 200 highlights per response (§6.6 performance requirement)
    const capped = annotations
      .filter(
        (a) => !a.resolvedAt && !a.detachedAt && !appliedFixIds?.includes(a.id)
      )
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
  }, [annotations, appliedFixIds, highlightOwner]);

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

  // Recompute when the text nodes are replaced after the first paint (syntax
  // highlighting of code blocks, late-loading content). A Range whose nodes
  // were removed collapses, which silently drops its highlight and preview.
  React.useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl || typeof MutationObserver === "undefined") return;

    let frame: number | null = null;
    const mo = new MutationObserver((mutations) => {
      if (mutations.every(isIgnoredMutation)) return;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        computeRanges();
      });
    });
    mo.observe(rootEl, { childList: true, characterData: true, subtree: true });
    return () => {
      mo.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [computeRanges]);

  const closePreview = React.useCallback(() => {
    setActivePreview(null);
    clearHoverHighlight();
  }, []);

  const scheduleDismiss = () => {
    if (isOverPopoverRef.current) return;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      if (!isOverPopoverRef.current) closePreview();
    }, 150);
  };

  // 3. Hover detection (pointermove, 250ms debounce, throttled via requestAnimationFrame)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Hovering is for a mouse or pen; touch uses the gutter dots.
    if (e.pointerType === "touch") return;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    const clientX = e.clientX;
    const clientY = e.clientY;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const rootEl = rootRef.current;
      if (!rootEl) return;

      const caret = getPointCaret(document, clientX, clientY);

      const matches: { annot: AnnotationItem; range: Range; rectIndex: number }[] = [];
      if (caret) {
        for (const item of activeRangeItemsRef.current) {
          if (!isPointInRange(item.range, caret.node, caret.offset)) continue;
          const rectIndex = hitLineRect(item.range, clientX, clientY);
          if (rectIndex === null) continue;
          matches.push({ annot: item.annot, range: item.range, rectIndex });
        }
      }

      if (matches.length > 0) {
        matches.sort(
          (a, b) =>
            (DISPLAY_PRIORITY[displayKind(b.annot)] ?? 0) -
            (DISPLAY_PRIORITY[displayKind(a.annot)] ?? 0)
        );
        const topMatch = matches[0]!;
        const hoverKey = matches.map((m) => m.annot.id).join("|");

        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
        if (pendingHoverKeyRef.current === hoverKey) {
          return;
        }

        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        pendingHoverKeyRef.current = hoverKey;

        hoverTimerRef.current = setTimeout(() => {
          hoverTimerRef.current = null;
          const line =
            topMatch.rectIndex >= 0
              ? rangeLineRects(topMatch.range)[topMatch.rectIndex]
              : undefined;
          focusCardRef.current = false;
          setActivePreview({
            annotation: topMatch.annot,
            range: topMatch.range,
            allMatching: matches.map((m) => m.annot),
            anchor: {
              type: "line",
              rectIndex: line ? topMatch.rectIndex : -1,
              offsetX: line ? clientX - line.left : 0,
            },
          });
          setHoverHighlight(topMatch.range);
        }, 250);
      } else {
        pendingHoverKeyRef.current = null;
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        scheduleDismiss();
      }
    });
  };

  const handlePointerLeave = () => {
    pendingHoverKeyRef.current = null;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    scheduleDismiss();
  };

  // Escape closes the card. When it was opened from a gutter dot and used
  // with the keyboard, the focus goes back to the dot (without opening the
  // card again).
  const handleEscape = React.useCallback(() => {
    if (!activePreview) return;
    if (
      activePreview.anchor.type === "dot" &&
      cardRef.current?.contains(document.activeElement)
    ) {
      skipDotFocusRef.current = true;
      activePreview.anchor.el.focus();
    }
    closePreview();
  }, [activePreview, closePreview]);

  React.useEffect(() => {
    if (!activePreview) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleEscape();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePreview, handleEscape]);

  // A card opened from a gutter dot with Enter, Space or a click takes the
  // focus, so its "View" buttons can be reached without a mouse.
  React.useEffect(() => {
    if (!activePreview || !focusCardRef.current) return;
    focusCardRef.current = false;
    const frame = requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLElement>("button")?.focus();
    });
    return () => cancelAnimationFrame(frame);
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

  // 4. Action: "View" opens the annotation's column right after the column
  // this text sits in (0 = main conversation, 1 = L1, 2 = L2...).
  const handleView = (annot: AnnotationItem) => {
    const columnAttr = rootRef.current
      ?.closest("[data-thread-column-index]")
      ?.getAttribute("data-thread-column-index");
    const fromIndex = columnAttr ? parseInt(columnAttr, 10) || 0 : 0;
    const store = useThreadStackStore.getState();
    store.rememberQuotes([{ id: annot.id, quote: annot.anchorExact }]);
    store.open({ kind: "annotation", id: annot.id }, { fromIndex });
    closePreview();
  };

  const handleViewAllInDrawer = () => {
    useUiStore.getState().setRightPanelOpen(true);
    closePreview();
  };

  // 5. Gutter dot: focus or hover shows the card; Enter, Space or a click
  // also moves the focus into it.
  const handleGutterDotActivate = (
    dot: GutterDot,
    el: HTMLElement,
    moveFocus: boolean
  ) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    focusCardRef.current = moveFocus;
    setActivePreview({
      annotation: dot.annotations[0]!,
      range: dot.firstRange,
      allMatching: dot.annotations,
      anchor: { type: "dot", el },
    });
    setHoverHighlight(dot.firstRange);
  };

  // The card is positioned against a virtual element measured on demand, so
  // it stays on the hovered line while the page or a column scrolls.
  const anchorRef = React.useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          activePreview
            ? previewAnchorRect(activePreview, rootRef.current)
            : EMPTY_RECT,
        get contextElement() {
          return rootRef.current ?? undefined;
        },
      },
    }),
    [activePreview]
  );

  const authorLabels = { klecx: t("klecxAuthor"), member: t("member") };
  const relativeTime = (raw?: string | Date | null): string => {
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    if (now.getTime() - d.getTime() < 60_000) return t("justNow");
    return format.relativeTime(d, now);
  };
  const stateLabel = (state: string): string =>
    QUESTION_STATES.has(state) ? t(`state.${state}`) : state;

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
  const authorName = targetAnnot
    ? authorLabel(targetAnnot, authorLabels)
    : authorLabels.member;

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
              aria-label={t("gutterLabel", { count: dot.count })}
              className="pointer-events-auto absolute -right-2 sm:-right-4 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-surface border border-border shadow-sm hover:border-accent hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-all cursor-pointer"
              style={{ top: `${dot.top}px` }}
              onClick={(e) => handleGutterDotActivate(dot, e.currentTarget, true)}
              onFocus={(e) => {
                if (skipDotFocusRef.current) {
                  skipDotFocusRef.current = false;
                  return;
                }
                handleGutterDotActivate(dot, e.currentTarget, false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleGutterDotActivate(dot, e.currentTarget, true);
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
                  title={t("klecxNoted")}
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
          if (!open) closePreview();
        }}
      >
        <PopoverAnchor virtualRef={anchorRef} />

        <PopoverContent
          ref={cardRef}
          role="dialog"
          aria-label={t("ariaLabel")}
          side="top"
          align={activePreview?.anchor.type === "dot" ? "end" : "center"}
          sideOffset={8}
          collisionPadding={8}
          hideWhenDetached
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={handleEscape}
          onInteractOutside={(e) => {
            // Going from one gutter dot to the next shows the next card; it
            // must not be closed by the focus leaving this one.
            const target = e.target as Element | null;
            if (
              target?.closest?.('[data-testid="gutter-dot"]') &&
              rootRef.current?.contains(target)
            ) {
              e.preventDefault();
            }
          }}
          onPointerEnter={() => {
            isOverPopoverRef.current = true;
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
          }}
          onPointerLeave={() => {
            isOverPopoverRef.current = false;
            // Free the passage, so going back onto it shows the card again.
            pendingHoverKeyRef.current = null;
            closePreview();
          }}
          className="z-50 w-72 max-w-[calc(100vw-16px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border border-border bg-surface p-3 text-fg shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
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
                        {t("aiReview")}
                      </span>
                    </>
                  )}
                  {kind === "REPLY" && (
                    <>
                      <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate max-w-[110px]">{authorName}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-accent bg-accent-soft px-1.5 py-0.5 rounded font-medium">
                        <Sparkles className="h-2.5 w-2.5" /> {t("aiReplied")}
                      </span>
                    </>
                  )}
                  {kind === "QUESTION" && (
                    <>
                      <HelpCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate max-w-[90px]">{authorName}</span>
                      {targetAnnot.questionState && (
                        <span className="text-[10px] uppercase font-semibold text-fg-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border">
                          {stateLabel(targetAnnot.questionState)}
                        </span>
                      )}
                    </>
                  )}
                  {hasKlecxNote(targetAnnot) && (
                    <span
                      data-testid="preview-klecx-badge"
                      className="inline-flex items-center gap-0.5 text-[10px] text-accent bg-accent-soft px-1 py-0.5 rounded font-medium shrink-0"
                      title={t("klecxNoted")}
                      aria-label={t("klecxNoted")}
                      role="img"
                    >
                      <KlecxLogoDot className="h-2 w-2" />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-fg-subtle shrink-0">
                  <Clock className="h-3 w-3" />
                  <span>{relativeTime(targetAnnot.createdAt)}</span>
                </div>
              </div>

              {/* Body: Preview Content */}
              {kind === "COMMENT" && (
                <div className="text-fg-muted leading-relaxed">
                  <p className="line-clamp-3 select-text">
                    {truncateText(commentText, 140)}
                  </p>
                </div>
              )}

              {/* Review comment: what is wrong, what would change, and the
                  decision, without leaving the text. */}
              {kind === "AI_REVIEW" && (
                <div className="space-y-2" data-testid="preview-ai-review">
                  <ReviewChips suggestion={targetAnnot.suggestion} />
                  <p className="text-fg-muted leading-relaxed line-clamp-4 select-text">
                    {truncateText(commentText, 280)}
                  </p>
                  <QuickFixBlock
                    annotation={targetAnnot}
                    ctx={quickFix}
                    onDone={closePreview}
                  />
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
                                {stateLabel(q.questionState)}
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

              {/* Primary "View" button */}
              <div className="pt-1 border-t border-border flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-accent hover:text-accent-hover hover:bg-accent-soft gap-1"
                  onClick={() => handleView(targetAnnot)}
                >
                  <span>{t("view")}</span>
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
                    const name = authorLabel(item, authorLabels);
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
                              {relativeTime(item.createdAt)}
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
                          aria-label={t("viewBy", { name })}
                          className="h-6 px-2 text-[11px] text-accent hover:text-accent-hover hover:bg-accent-soft shrink-0"
                          onClick={() => handleView(item)}
                        >
                          {t("view")}
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
                      {t("viewAll", {
                        count: activePreview?.allMatching.length ?? 0,
                      })}
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
