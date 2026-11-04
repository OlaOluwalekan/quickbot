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
 * Applies a list of ranges to the CSS Custom Highlight API by annotation kind.
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
      Highlight: new (...ranges: Range[]) => unknown;
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

  // Set or delete each highlight category
  for (const kind of ["COMMENT", "QUESTION", "REPLY"] as AnnotationKind[]) {
    const name = HIGHLIGHT_NAME_MAP[kind];
    const ranges = byName.get(name) ?? [];

    if (ranges.length > 0) {
      const hl = new HighlightCtor(...ranges);
      CSS.highlights.set(name, hl as never);
    } else {
      CSS.highlights.delete(name);
    }
  }

  return true;
}

/**
 * Clears all active annotation highlights from CSS.highlights.
 */
export function clearCustomHighlights(): void {
  if (!isCustomHighlightSupported()) {
    return;
  }

  for (const name of Object.values(HIGHLIGHT_NAME_MAP)) {
    CSS.highlights.delete(name);
  }
}

/**
 * Calculates absolute overlay rectangles relative to `root` for a DOM Range.
 * Used as a fallback when the browser does not support the CSS Custom Highlight API.
 */
export function getFallbackHighlightRects(
  range: Range,
  root: HTMLElement
): HighlightRect[] {
  const rootRect = root.getBoundingClientRect();
  const clientRects = Array.from(range.getClientRects());

  return clientRects
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({
      top: r.top - rootRect.top,
      left: r.left - rootRect.left,
      width: r.width,
      height: r.height,
    }));
}
