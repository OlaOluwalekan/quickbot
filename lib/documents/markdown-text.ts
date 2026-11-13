import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/**
 * Maps a span of Markdown source to the text a reader sees on the page.
 *
 * Highlights are anchored to the rendered text (what `selectionToAnchor`
 * reads from the page), while quick fixes replace Markdown source. A review
 * finding is located in the source, so its anchor has to be translated:
 * "use **JavScript** now" in the source reads "use JavScript now" on the page.
 *
 * Only plain text is mapped. A span that touches inline code, a formula, raw
 * HTML, an image or an escaped character, or that crosses a block (paragraph,
 * heading, table cell), has no reliable page text and is refused.
 */

interface MdNode {
  type: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MdNode[];
}

interface Run {
  srcStart: number;
  srcEnd: number;
  pageStart: number;
  block: number;
  /** Position among the runs and gaps of the document. */
  order: number;
}

export interface PageSpan {
  /** The span as shown on the page. */
  exact: string;
  prefix: string;
  suffix: string;
  /** Offsets in the page text of the document (hints for the client). */
  start: number;
  end: number;
}

export interface MarkdownTextMap {
  /** The text of the document as shown on the page (blocks joined by a line break). */
  pageText: string;
  /** Page text for the source span `[srcStart, srcEnd)`, or null when it can't be mapped. */
  locate(srcStart: number, srcEnd: number, contextLength?: number): PageSpan | null;
}

/** Blocks whose text is one continuous piece of the page. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "tableCell"]);

export function buildMarkdownTextMap(source: string): MarkdownTextMap {
  const runs: Run[] = [];
  /** `order` values of content that is on the page but not mapped. */
  const gaps: Array<{ order: number; block: number }> = [];
  let pageText = "";
  let order = 0;
  let blockCounter = 0;
  let lastBlock = -1;

  let tree: MdNode | null = null;
  try {
    tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .parse(source) as MdNode;
  } catch {
    tree = null;
  }

  function walk(node: MdNode, block: number): void {
    if (TEXT_BLOCKS.has(node.type)) {
      block = ++blockCounter;
    }

    if (node.type === "text") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const value = node.value ?? "";
      const oneToOne =
        block > 0 &&
        typeof start === "number" &&
        typeof end === "number" &&
        end - start === value.length &&
        source.slice(start, end) === value;
      if (!oneToOne) {
        gaps.push({ order: order++, block });
        return;
      }
      if (lastBlock !== -1 && lastBlock !== block) pageText += "\n";
      lastBlock = block;
      runs.push({
        srcStart: start,
        srcEnd: end,
        pageStart: pageText.length,
        block,
        order: order++,
      });
      pageText += value;
      return;
    }

    if (!node.children || node.children.length === 0) {
      // Inline code, formulas, HTML, images, line breaks, footnote marks…
      if (node.type !== "root") gaps.push({ order: order++, block });
      return;
    }
    for (const child of node.children) walk(child, block);
  }

  if (tree) walk(tree, 0);

  function locate(
    srcStart: number,
    srcEnd: number,
    contextLength = 32
  ): PageSpan | null {
    if (srcEnd <= srcStart) return null;
    const touched = runs.filter((r) => r.srcEnd > srcStart && r.srcStart < srcEnd);
    if (touched.length === 0) return null;

    const first = touched[0]!;
    const last = touched[touched.length - 1]!;
    if (touched.some((r) => r.block !== first.block)) return null;
    // Unmapped content inside the span: its page text is unknown.
    if (gaps.some((g) => g.order > first.order && g.order < last.order)) {
      return null;
    }
    // The span must not start or end in unmapped content either: every
    // source character outside the runs has to be Markdown syntax of the
    // same block. A gap right at the edge is caught by comparing blocks.
    const edgeGap = gaps.some(
      (g) =>
        g.block === first.block &&
        ((g.order === first.order - 1 && srcStart < first.srcStart) ||
          (g.order === last.order + 1 && srcEnd > last.srcEnd))
    );
    if (edgeGap) return null;

    const start = first.pageStart + Math.max(0, srcStart - first.srcStart);
    const end = last.pageStart + (Math.min(srcEnd, last.srcEnd) - last.srcStart);
    if (end <= start) return null;

    return {
      exact: pageText.slice(start, end),
      prefix: pageText.slice(Math.max(0, start - contextLength), start),
      suffix: pageText.slice(end, Math.min(pageText.length, end + contextLength)),
      start,
      end,
    };
  }

  return { pageText, locate };
}
