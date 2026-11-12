import "server-only";
import katex from "katex";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { quoteIsFromSource } from "@/lib/annotations/quote-match";

interface MarkdownNode {
  type: string;
  value?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: MarkdownNode[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** The text a browser shows for a piece of HTML (tags removed). */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, name: string) => {
      if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? match;
      const code =
        name[1]?.toLowerCase() === "x"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    });
}

function collectMath(node: MarkdownNode, found: MarkdownNode[]): void {
  if (node.type === "math" || node.type === "inlineMath") found.push(node);
  for (const child of node.children ?? []) collectMath(child, found);
}

/**
 * Replaces each formula of a Markdown text with the text the page shows for
 * it. A rendered formula has little in common with its LaTeX source
 * (`\frac{\pi}{2}` reads "π2" on the page, and the page text also carries a
 * hidden copy for screen readers), so a highlight made of a formula alone can't
 * be found in the source.
 */
export function renderMathAsPageText(source: string): string {
  if (!source.includes("$")) return source;

  let formulas: MarkdownNode[] = [];
  try {
    const tree = unified()
      .use(remarkParse)
      .use(remarkMath)
      .parse(source) as MarkdownNode;
    collectMath(tree, formulas);
  } catch {
    return source;
  }
  formulas = formulas.filter(
    (f) =>
      typeof f.position?.start.offset === "number" &&
      typeof f.position?.end.offset === "number"
  );
  if (formulas.length === 0) return source;

  let result = "";
  let cursor = 0;
  for (const formula of formulas) {
    const start = formula.position!.start.offset!;
    const end = formula.position!.end.offset!;
    if (start < cursor) continue;
    let text: string;
    try {
      text = htmlToText(
        katex.renderToString(formula.value ?? "", {
          displayMode: formula.type === "math",
          throwOnError: false,
        })
      );
    } catch {
      text = source.slice(start, end);
    }
    result += source.slice(cursor, start) + text;
    cursor = end;
  }
  return result + source.slice(cursor);
}

/**
 * True when `quote` (text selected on the page) is a passage of `source` (the
 * stored Markdown). Used for every annotation target.
 */
export function quoteIsFromStoredText(source: string, quote: string): boolean {
  if (quoteIsFromSource(source, quote)) return true;
  const pageText = renderMathAsPageText(source);
  return pageText !== source && quoteIsFromSource(pageText, quote);
}
