/**
 * CSS Custom Highlight API and fallback overlay support for Klecx annotations (§6.1, §6.6, F2.6).
 *
 * Delegates global CSS.highlights range merging to `./highlight-registry` so
 * multiple mounted AnnotationLayer instances coexist without overwriting one another.
 */

import {
  HIGHLIGHT_NAME_MAP,
  HIGHLIGHT_PRIORITY_MAP,
  isCustomHighlightSupported,
  registerHighlightRanges,
  unregisterHighlightOwner,
  setHoverHighlightRange,
  clearHoverHighlightRange,
  type HighlightKind,
} from "./highlight-registry";

export {
  HIGHLIGHT_NAME_MAP,
  HIGHLIGHT_PRIORITY_MAP,
  isCustomHighlightSupported,
  type HighlightKind,
};

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Registers the ranges of one owner with the shared highlight registry, by
 * highlight kind, with stacking priority ask (2) / ai_review (2) > comment (1).
 * Replaces the ranges this owner registered before; other owners keep theirs.
 */
export function applyCustomHighlights(
  groups: { kind: HighlightKind; ranges: Range[] }[],
  owner?: string
): boolean {
  return registerHighlightRanges(groups, owner);
}

/**
 * Sets or clears the hover highlight (`annot-hover`) for the given range,
 * setting high priority (10) so the hover background is painted on top.
 */
export function setHoverHighlight(range: Range | null): boolean {
  return setHoverHighlightRange(range);
}

/**
 * Clears the active hover highlight from CSS.highlights.
 */
export function clearHoverHighlight(): void {
  clearHoverHighlightRange();
}

/**
 * Removes the annotation highlights of one owner (other owners keep theirs).
 * Without an owner: removes every annotation highlight and the hover highlight.
 */
export function clearCustomHighlights(owner?: string): void {
  unregisterHighlightOwner(owner);
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
