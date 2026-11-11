/**
 * Global CSS Custom Highlight registry for Klecx annotations (Step F2.6).
 *
 * The browser's `CSS.highlights` map is global per document, so mounting
 * multiple `AnnotationLayer` instances (main responses + nested L1/L2/L3 Ask
 * columns) would overwrite each other if each wrote directly to `CSS.highlights`.
 *
 * This registry collects ranges keyed by mounted owner (`React.useId()`) and
 * merges them into three global highlight layers (`annot-comment`, `annot-ask`,
 * `annot-ai-review`) plus `annot-hover`, avoiding hundreds of per-root names.
 */

import type { AnnotationKind } from "./anchor";

export type HighlightKind = AnnotationKind | "AI_REVIEW";

export const HIGHLIGHT_NAME_MAP: Record<HighlightKind, string> = {
  COMMENT: "annot-comment",
  ASK: "annot-ask",
  AI_REVIEW: "annot-ai-review",
};

export const HIGHLIGHT_PRIORITY_MAP: Record<HighlightKind, number> = {
  ASK: 2,
  AI_REVIEW: 2,
  COMMENT: 1,
};

const HIGHLIGHT_KINDS: HighlightKind[] = ["COMMENT", "AI_REVIEW", "ASK"];
const DEFAULT_OWNER = "default";
const rangesByOwner = new Map<string, Map<string, Range[]>>();

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

function paintCustomHighlights(): void {
  if (!isCustomHighlightSupported()) {
    return;
  }

  const HighlightCtor = (
    globalThis as unknown as {
      Highlight: new (...ranges: Range[]) => { priority?: number };
    }
  ).Highlight;

  for (const kind of HIGHLIGHT_KINDS) {
    const name = HIGHLIGHT_NAME_MAP[kind];
    const ranges: Range[] = [];
    rangesByOwner.forEach((byName) => {
      ranges.push(...(byName.get(name) ?? []));
    });

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
}

/**
 * Registers or replaces the ranges contributed by one `AnnotationLayer` owner
 * and repaints the merged global highlights. Other mounted owners keep theirs.
 */
export function registerHighlightRanges(
  groups: { kind: HighlightKind; ranges: Range[] }[],
  owner: string = DEFAULT_OWNER
): boolean {
  if (!isCustomHighlightSupported()) {
    return false;
  }

  const byName = new Map<string, Range[]>();
  for (const group of groups) {
    const name = HIGHLIGHT_NAME_MAP[group.kind];
    if (!name || group.ranges.length === 0) continue;
    const existing = byName.get(name) ?? [];
    existing.push(...group.ranges);
    byName.set(name, existing);
  }

  if (byName.size > 0) {
    rangesByOwner.set(owner, byName);
  } else {
    rangesByOwner.delete(owner);
  }

  paintCustomHighlights();
  return true;
}

/**
 * Removes all ranges registered by `owner` (if omitted, clears all owners and
 * the active hover highlight).
 */
export function unregisterHighlightOwner(owner?: string): void {
  if (!isCustomHighlightSupported()) {
    if (owner !== undefined) {
      rangesByOwner.delete(owner);
    } else {
      rangesByOwner.clear();
    }
    return;
  }

  if (owner !== undefined) {
    if (rangesByOwner.delete(owner)) {
      paintCustomHighlights();
    }
    return;
  }

  rangesByOwner.clear();
  for (const name of Object.values(HIGHLIGHT_NAME_MAP)) {
    CSS.highlights.delete(name);
  }
  CSS.highlights.delete("annot-hover");
}

/**
 * Sets or clears the hover/focus highlight (`annot-hover`) for the given range,
 * using high priority (10) so it paints on top of base annotation marks.
 */
export function setHoverHighlightRange(range: Range | null): boolean {
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
 * Clears the active hover/focus highlight from `CSS.highlights`.
 */
export function clearHoverHighlightRange(): void {
  if (!isCustomHighlightSupported()) {
    return;
  }
  CSS.highlights.delete("annot-hover");
}

/**
 * Returns the number of currently registered mounted owners in the registry.
 */
export function getHighlightOwnerCount(): number {
  return rangesByOwner.size;
}
