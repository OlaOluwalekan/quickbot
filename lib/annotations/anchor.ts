/**
 * W3C TextQuoteSelector & DOM anchoring implementation for Klecx annotations (§6.1).
 *
 * Reliably maps between DOM selections and serializable Anchors (`exact`, `prefix`, `suffix`,
 * `start`, `end`). Accurately restores DOM ranges even after DOM re-renders or minor content shifts,
 * and cleanly marks annotations as detached (null) when the anchored text cannot be found.
 */

export interface Anchor {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
}

export type AnnotationKind = "COMMENT" | "ASK";

/**
 * F2.1: REPLY and QUESTION were merged into ASK. An Ask that went through the
 * queue (or was migrated from a REPLY) carries a questionState other than
 * NONE; an "Ask now" keeps NONE. The Phase-6 UI still shows the two in
 * separate places until F2.4 replaces the right panel.
 */
export function isQueuedAsk(a: { kind: string; questionState?: string | null }): boolean {
  return a.kind === "ASK" && !!a.questionState && a.questionState !== "NONE";
}
export type QuestionState =
  | "NONE"
  | "QUEUED"
  | "ANSWERING"
  | "ANSWERED"
  | "CANCELLED"
  | "FAILED";
export type Visibility = "PRIVATE" | "WORKSPACE";
export type ContentSource = "ORIGINAL" | "EDIT";
export type MsgRole = "USER" | "ASSISTANT";

export const ANCHOR_CONTEXT_LENGTH = 32;
export const ANCHOR_SIMILARITY_THRESHOLD = 0.5;

/**
 * Traverses `root` and collects all Text nodes in document order, strictly
 * skipping any subtree rooted at an element with `data-annot-ignore`
 * (e.g. copy buttons, citation pills, action menus, thinking panels).
 */
export function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];

  function walk(node: Node) {
    if (node.nodeType === 1) {
      // Element node
      const el = node as Element;
      if (
        el.hasAttribute("data-annot-ignore") ||
        el.getAttribute("data-annot-ignore") === "true"
      ) {
        return;
      }
    }

    if (node.nodeType === 3) {
      // Text node
      nodes.push(node as Text);
    } else {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        walk(children[i]!);
      }
    }
  }

  walk(root);
  return nodes;
}

/**
 * Computes character offset of a (container, offset) point within the concatenated
 * text of `nodes`. Correctly handles Text nodes and Element container boundaries.
 */
export function offsetOf(
  nodes: Text[],
  targetContainer: Node,
  targetOffset: number
): number {
  let offset = 0;

  // 1. Direct match: container is one of our collected Text nodes
  for (const node of nodes) {
    if (node === targetContainer) {
      return offset + Math.min(targetOffset, node.data.length);
    }
    offset += node.data.length;
  }

  // 2. Container is an Element (selection start/end at child node index)
  offset = 0;
  const targetChild =
    targetContainer.childNodes && targetOffset < targetContainer.childNodes.length
      ? targetContainer.childNodes[targetOffset]
      : null;

  for (const node of nodes) {
    if (targetChild) {
      if (
        node === targetChild ||
        (targetChild.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING)
      ) {
        return offset;
      }
    } else {
      if (targetContainer.contains(node)) {
        offset += node.data.length;
        continue;
      }
      if (
        targetContainer.compareDocumentPosition(node) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        return offset;
      }
    }
    offset += node.data.length;
  }

  return offset;
}

/**
 * Creates a DOM Range covering character offsets `start` to `end` across `nodes`.
 * Returns `null` if offsets are invalid or out of bounds.
 */
export function rangeFromOffsets(
  root: HTMLElement,
  nodes: Text[],
  start: number,
  end: number
): Range | null {
  if (start < 0 || end < start || nodes.length === 0) {
    return null;
  }

  const doc =
    root.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  let startNode: Text | null = null;
  let startOffsetInNode = 0;
  let endNode: Text | null = null;
  let endOffsetInNode = 0;

  let currentOffset = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const nodeLength = node.data.length;
    const nextOffset = currentOffset + nodeLength;

    if (!startNode && start <= nextOffset) {
      startNode = node;
      startOffsetInNode = Math.max(0, start - currentOffset);
    }

    if (!endNode && end <= nextOffset) {
      endNode = node;
      endOffsetInNode = Math.max(0, end - currentOffset);
    }

    if (startNode && endNode) break;
    currentOffset = nextOffset;
  }

  if (!startNode || !endNode) {
    return null;
  }

  const range = doc.createRange();
  range.setStart(startNode, startOffsetInNode);
  range.setEnd(endNode, endOffsetInNode);
  return range;
}

/**
 * Converts a DOM selection `Range` within `root` into a serializable W3C `Anchor`.
 */
export function selectionToAnchor(root: HTMLElement, range: Range): Anchor {
  const nodes = textNodes(root);
  const full = nodes.map((n) => n.data).join("");
  const start = offsetOf(nodes, range.startContainer, range.startOffset);
  const end = offsetOf(nodes, range.endContainer, range.endOffset);

  const safeStart = Math.max(0, Math.min(start, full.length));
  const safeEnd = Math.max(safeStart, Math.min(end, full.length));

  return {
    exact: full.slice(safeStart, safeEnd),
    prefix: full.slice(Math.max(0, safeStart - ANCHOR_CONTEXT_LENGTH), safeStart),
    suffix: full.slice(
      safeEnd,
      Math.min(full.length, safeEnd + ANCHOR_CONTEXT_LENGTH)
    ),
    start: safeStart,
    end: safeEnd,
  };
}

/**
 * Finds all 0-based start indexes of `search` within `full`.
 */
export function allIndexesOf(full: string, search: string): number[] {
  if (!search) return [];
  const indexes: number[] = [];
  let pos = 0;
  while (pos < full.length) {
    const idx = full.indexOf(search, pos);
    if (idx === -1) break;
    indexes.push(idx);
    pos = idx + 1;
  }
  return indexes;
}

/**
 * Computes context string similarity between two strings (0.0 to 1.0).
 * Uses bigram Dice coefficient with exact match and prefix/suffix fallback.
 */
export function sim(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a.length && !b.length) return 1.0;
  if (!a.length || !b.length) return 0.0;

  const s1 = a.trim();
  const s2 = b.trim();
  if (s1 === s2) return 1.0;
  if (!s1.length && !s2.length) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  if (s1.length < 2 || s2.length < 2) {
    return s1.includes(s2) || s2.includes(s1) ? 0.75 : 0.0;
  }

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) ?? 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  const total = s1.length - 1 + (s2.length - 1);
  return (2.0 * intersection) / total;
}

/**
 * Restores a DOM Range from an `Anchor` within `root`.
 * - Fast path: if text at [anchor.start, anchor.end] === anchor.exact, returns range immediately.
 * - Robust fallback: searches for occurrences of `anchor.exact` and scores candidates by
 *   prefix and suffix context similarity.
 * - Returns `null` (DETACHED) if exact text is missing or context similarity is below threshold.
 */
export function anchorToRange(
  root: HTMLElement,
  a: Anchor,
  precomputed?: { nodes: Text[]; full: string }
): Range | null {
  if (!a || !a.exact) return null;

  const nodes = precomputed?.nodes ?? textNodes(root);
  if (!nodes.length) return null;

  const full = precomputed?.full ?? nodes.map((n) => n.data).join("");

  // 1. Fast path: text is still at the hinted start..end offsets
  if (
    typeof a.start === "number" &&
    typeof a.end === "number" &&
    a.start >= 0 &&
    a.end <= full.length &&
    full.slice(a.start, a.end) === a.exact
  ) {
    return rangeFromOffsets(root, nodes, a.start, a.end);
  }

  // 2. Fallback: find all occurrences of exact text
  const hits = allIndexesOf(full, a.exact);
  if (!hits.length) {
    return null; // DETACHED: exact text does not exist in document
  }

  const prefixLen = a.prefix ? a.prefix.length : ANCHOR_CONTEXT_LENGTH;
  const suffixLen = a.suffix ? a.suffix.length : ANCHOR_CONTEXT_LENGTH;

  const scored = hits.map((i) => {
    const candPrefix = full.slice(Math.max(0, i - prefixLen), i);
    const candSuffix = full.slice(
      i + a.exact.length,
      Math.min(full.length, i + a.exact.length + suffixLen)
    );
    const score =
      sim(candPrefix, a.prefix || "") + sim(candSuffix, a.suffix || "");
    return { i, score };
  });

  scored.sort((x, y) => y.score - x.score);
  const best = scored[0]!;

  if (best.score >= ANCHOR_SIMILARITY_THRESHOLD || hits.length === 1) {
    return rangeFromOffsets(root, nodes, best.i, best.i + a.exact.length);
  }

  return null;
}
