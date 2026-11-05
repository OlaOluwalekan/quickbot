/**
 * CSS Custom Highlight API and fallback overlay support for Klecx annotations (§6.1, §6.6).
 *
 * Utilizes the CSS Custom Highlight API (`CSS.highlights.set(...)`) to paint high-performance,
 * zero-layout-shift highlights on response text without modifying React-managed DOM nodes.
 * Provides fallback rectangle computation for browsers lacking the Highlight API.
 */

import type { AnnotationKind } from "./anchor";

export const HIGHLIGHT_NAME_MAP: Record<AnnotationKind, string> = {
  COMMENT: "annot-comment",
  QUESTION: "annot-question",
  REPLY: "annot-reply",
};

export const HIGHLIGHT_PRIORITY_MAP: Record<AnnotationKind, number> = {
  REPLY: 3,
  QUESTION: 2,
  COMMENT: 1,
};

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Checks if the CSS Custom Highlight API is supported in the current environment.
 */
export function isCustomHighlightSupported(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof (globalThis as unknown as { Highlight?: unknown }).Highlight ===
      "function"
  );
}

/**
 * Applies a list of ranges to the CSS Custom Highlight API by annotation kind,
 * applying stacking priorities: reply (3) > question (2) > comment (1).
 * Returns `true` if highlights were successfully registered with the browser,
 * or `false` if the Custom Highlight API is unsupported.
 */
export function applyCustomHighlights(
  groups: { kind: AnnotationKind; ranges: Range[] }[]
): boolean {
  if (!isCustomHighlightSupported()) {
    return false;
  }

  const HighlightCtor = (
    globalThis as unknown as {
      Highlight: new (...ranges: Range[]) => { priority?: number };
    }
  ).Highlight;

  // Group ranges by highlight name
  const byName = new Map<string, Range[]>();
  for (const group of groups) {
    const name = HIGHLIGHT_NAME_MAP[group.kind];
    if (!name) continue;
    const existing = byName.get(name) ?? [];
    existing.push(...group.ranges);
    byName.set(name, existing);
  }

  // Set or delete each highlight category with appropriate stacking priority
  for (const kind of ["COMMENT", "QUESTION", "REPLY"] as AnnotationKind[]) {
    const name = HIGHLIGHT_NAME_MAP[kind];
    const ranges = byName.get(name) ?? [];

    if (ranges.length > 0) {
      const hl = new HighlightCtor(...ranges);
      if (typeof hl === "object" && hl !== null) {
        hl.priority = HIGHLIGHT_PRIORITY_MAP[kind] ?? 1;
      }
      CSS.highlights.set(name, hl as never);
    } else {
      CSS.highlights.delete(name);
    }
  }

  return true;
}

/**
 * Sets or clears the hover highlight (`annot-hover`) for the given range,
 * setting high priority (10) so the hover underline is painted on top.
 */
export function setHoverHighlight(range: Range | null): boolean {
  if (!isCustomHighlightSupported()) {
    return false;
  }

  if (range) {
    const HighlightCtor = (
      globalThis as unknown as {
        Highlight: new (...ranges: Range[]) => { priority?: number };
      }
    ).Highlight;
    const hl = new HighlightCtor(range);
    if (typeof hl === "object" && hl !== null) {
      hl.priority = 10;
    }
    CSS.highlights.set("annot-hover", hl as never);
  } else {
    CSS.highlights.delete("annot-hover");
  }

  return true;
}

/**
 * Clears the active hover highlight from CSS.highlights.
 */
export function clearHoverHighlight(): void {
  if (!isCustomHighlightSupported()) {
    return;
  }
  CSS.highlights.delete("annot-hover");
}

/**
 * Clears all active annotation highlights and hover highlight from CSS.highlights.
 */
export function clearCustomHighlights(): void {
  if (!isCustomHighlightSupported()) {
    return;
  }

  for (const name of Object.values(HIGHLIGHT_NAME_MAP)) {
    CSS.highlights.delete(name);
  }
  CSS.highlights.delete("annot-hover");
}

/**
 * Safely resolves the document caret position at client coordinates (x, y).
 * Uses standard `document.caretPositionFromPoint` with fallback to `document.caretRangeFromPoint`.
 */
export function getPointCaret(
  doc: Document,
  x: number,
  y: number
): { node: Node; offset: number } | null {
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode) {
      return { node: pos.offsetNode, offset: pos.offset };
    }
  }

  if (
    typeof (doc as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null })
      .caretRangeFromPoint === "function"
  ) {
    const range = (
      doc as unknown as { caretRangeFromPoint: (x: number, y: number) => Range | null }
    ).caretRangeFromPoint(x, y);
    if (range && range.startContainer) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }

  return null;
}

/**
 * Determines whether the given text point (node, offset) is within the DOM Range.
 */
export function isPointInRange(range: Range, node: Node, offset: number): boolean {
  try {
    if (typeof range.isPointInRange === "function") {
      return range.isPointInRange(node, offset);
    }
    if (typeof range.comparePoint === "function") {
      return range.comparePoint(node, offset) === 0;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Calculates absolute overlay rectangles relative to `root` for a DOM Range.
 * Used as a fallback when the browser does not support the CSS Custom Highlight API.
 */
export function getFallbackHighlightRects(
  range: Range,
  root: HTMLElement
): HighlightRect[] {
  const rootRect =
    typeof root.getBoundingClientRect === "function"
      ? root.getBoundingClientRect()
      : { top: 0, left: 0, width: 0, height: 0 };
  const clientRects =
    typeof range.getClientRects === "function"
      ? Array.from(range.getClientRects())
      : [];

  return clientRects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      top: r.top - rootRect.top,
      left: r.left - rootRect.left,
      width: r.width,
      height: r.height,
    }));
}
