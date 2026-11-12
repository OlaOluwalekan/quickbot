import "server-only";
import mammoth from "mammoth";
import TurndownService from "turndown";
import { strikethrough } from "turndown-plugin-gfm";
import { MAX_CSV_ROWS } from "@/lib/documents/workspace-document-types";

export { MAX_CSV_ROWS };

export const MAX_EXTRACTED_CHARS = 200_000;
export const MAX_PDF_PAGES = 100;
export const EXTRACTION_TIMEOUT_MS = 10_000;

export type DocumentExtractionErrorCode =
  | "document_page_limit"
  | "document_type_unsupported"
  | "document_timeout";

/** A failure the person can act on. `message` is for logs and tests only. */
export class DocumentExtractionError extends Error {
  constructor(
    public code: DocumentExtractionErrorCode,
    message: string,
    public details?: Record<string, number>
  ) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

export interface DocumentToMarkdownOptions {
  maxPages?: number;
  maxChars?: number;
  timeoutMs?: number;
}

export interface DocumentToMarkdownResult {
  markdown: string;
  truncated: boolean;
  pageCount?: number;
  totalRows?: number;
}

function stripControlChars(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function joinPdfPageParagraphs(pageText: string): string {
  const normalized = stripControlChars(pageText).trim();
  if (!normalized) return "";

  // Split by blank lines first (explicit paragraph breaks)
  const blocks = normalized.split(/\n\s*\n+/);
  const joinedBlocks = blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length <= 1) return lines.join("");

    let acc = lines[0]!;
    for (let i = 1; i < lines.length; i++) {
      const next = lines[i]!;
      const prevEndsSentence = /[.!?:;”"'\])]$/.test(acc);
      const nextStartsLower = /^[a-z]/.test(next);
      const nextIsBullet = /^([-*•]|\d+[.)])\s/.test(next);

      if (!nextIsBullet && (!prevEndsSentence || nextStartsLower)) {
        // Handle hyphenated word breaks at line end
        if (/[a-zA-Z]-$/.test(acc) && nextStartsLower) {
          acc = acc.slice(0, -1) + next;
        } else {
          acc = `${acc} ${next}`;
        }
      } else {
        acc = `${acc}\n\n${next}`;
      }
    }
    return acc;
  });

  return joinedBlocks.filter(Boolean).join("\n\n");
}

function parseCsvRows(csvText: string): string[][] {
  const text = stripControlChars(csvText);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (ch === "\n") {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function escapeTableCell(cell: string): string {
  return cell.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function csvToMarkdown(csvText: string): {
  markdown: string;
  truncated: boolean;
  totalRows: number;
} {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return { markdown: "", truncated: false, totalRows: 0 };
  }

  const header = rows[0]!;
  const dataRows = rows.slice(1);
  const totalRows = dataRows.length;
  const colCount = Math.max(
    header.length,
    ...dataRows.slice(0, MAX_CSV_ROWS).map((r) => r.length),
    1
  );

  const normalizeRow = (r: string[]) => {
    const cells: string[] = [];
    for (let c = 0; c < colCount; c++) {
      cells.push(escapeTableCell(r[c] ?? ""));
    }
    return `| ${cells.join(" | ")} |`;
  };

  const headerLine = normalizeRow(header);
  const dividerLine = `| ${Array.from({ length: colCount }, () => "---").join(" | ")} |`;
  const visibleRows = dataRows.slice(0, MAX_CSV_ROWS).map(normalizeRow);

  // The caller tells the person how many rows were left out (`totalRows`):
  // a sentence written here would become part of their document.
  const lines = [headerLine, dividerLine, ...visibleRows];
  const isTruncated = totalRows > MAX_CSV_ROWS;

  return {
    markdown: lines.join("\n"),
    truncated: isTruncated,
    totalRows,
  };
}

/** Minimal DOM surface of the nodes turndown hands to a rule. */
interface HtmlNode {
  nodeName: string;
  innerHTML: string;
  childNodes: ArrayLike<HtmlNode>;
  getAttribute(name: string): string | null;
}

function childElements(node: HtmlNode, names: string[]): HtmlNode[] {
  return Array.from(node.childNodes).filter((child) =>
    names.includes(child.nodeName)
  );
}

function tableRows(table: HtmlNode): HtmlNode[] {
  const rows: HtmlNode[] = [];
  for (const child of Array.from(table.childNodes)) {
    if (child.nodeName === "TR") rows.push(child);
    else if (["THEAD", "TBODY", "TFOOT"].includes(child.nodeName)) {
      rows.push(...childElements(child, ["TR"]));
    }
  }
  return rows;
}

function spanOf(cell: HtmlNode, attribute: "colspan" | "rowspan"): number {
  const value = Number.parseInt(cell.getAttribute(attribute) ?? "1", 10);
  return Number.isFinite(value) && value > 1 ? Math.min(value, 50) : 1;
}

/**
 * Turns an HTML table into a GFM table.
 *
 * Word tables have no header row and their cells hold paragraphs, so the
 * stock GFM plugin leaves them as raw HTML. Here the first row becomes the
 * header, paragraphs inside a cell are joined with `<br>`, and merged cells
 * are spread over the columns they cover so the columns stay aligned.
 */
function tableToMarkdown(
  table: HtmlNode,
  cellToMarkdown: (html: string) => string
): string {
  const grid: string[][] = [];
  // Columns still covered by a cell merged down from an earlier row.
  const carried: number[] = [];

  for (const row of tableRows(table)) {
    const line: string[] = [];
    let column = 0;
    const skipCarried = () => {
      while ((carried[column] ?? 0) > 0) {
        carried[column]!--;
        line.push("");
        column++;
      }
    };

    for (const cell of childElements(row, ["TD", "TH"])) {
      skipCarried();
      const text = cellToMarkdown(cell.innerHTML)
        .replace(/\|/g, "\\|")
        .trim()
        .replace(/\n+/g, "<br>");
      const colspan = spanOf(cell, "colspan");
      const rowspan = spanOf(cell, "rowspan");
      for (let i = 0; i < colspan; i++) {
        line.push(i === 0 ? text : "");
        if (rowspan > 1) carried[column] = rowspan - 1;
        column++;
      }
    }
    skipCarried();
    if (line.length > 0) grid.push(line);
  }

  if (grid.length === 0) return "";

  const width = Math.max(...grid.map((line) => line.length));
  const toLine = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] || " ").join(" | ")} |`;

  const [header, ...body] = grid;
  return [
    toLine(header!),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map(toLine),
  ].join("\n");
}

function createDocxTurndown(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  turndown.use(strikethrough);
  turndown.remove(["script", "style", "iframe", "object", "embed", "noscript"]);

  // The document's own text must stay text: "<b>" typed in Word is not a tag
  // and "&amp;" is not an entity once the Markdown is rendered.
  const escapeMarkdown = turndown.escape.bind(turndown);
  turndown.escape = (text: string) =>
    escapeMarkdown(text)
      .replace(/</g, "\\<")
      .replace(/&(?=#?\w+;)/g, "\\&");

  // The picture itself is not imported. Its description is kept as an image
  // with no address, which the document view shows as a placeholder box.
  turndown.addRule("imagePlaceholder", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = ((node as unknown as HtmlNode).getAttribute("alt") ?? "")
        .replace(/\s+/g, " ")
        .replace(/[[\]\\]/g, "\\$&")
        .trim();
      return `![${alt}]()`;
    },
  });

  turndown.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const markdown = tableToMarkdown(node as unknown as HtmlNode, (html) =>
        // A table inside a cell can't be a table in Markdown: keep its text.
        createDocxTurndown()
          .addRule("nestedTable", {
            filter: "table",
            replacement: (content) => content,
          })
          .turndown(html)
      );
      return markdown ? `\n\n${markdown}\n\n` : "";
    },
  });

  return turndown;
}

async function docxToMarkdown(buf: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: buf },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        // The image bytes are dropped; only the description is kept.
        const alt = (image as { altText?: string }).altText || "";
        return { src: "", alt };
      }),
    }
  );

  const rawMd = createDocxTurndown().turndown(result.value || "");
  return stripControlChars(rawMd).trim();
}

export async function documentToMarkdown(
  buf: Buffer,
  mime: string,
  name: string,
  options?: DocumentToMarkdownOptions
): Promise<DocumentToMarkdownResult> {
  const maxPages = options?.maxPages ?? MAX_PDF_PAGES;
  const maxChars = options?.maxChars ?? MAX_EXTRACTED_CHARS;
  const timeoutMs = options?.timeoutMs ?? EXTRACTION_TIMEOUT_MS;

  const lowerName = (name || "").toLowerCase();
  const normalizedMime = (mime || "").toLowerCase();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new DocumentExtractionError(
          "document_timeout",
          `Document extraction timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  const workPromise = (async (): Promise<DocumentToMarkdownResult> => {
    let rawMarkdown = "";
    let pageCount: number | undefined;
    let totalRows: number | undefined;
    let csvTruncated = false;

    if (
      normalizedMime === "text/markdown" ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown")
    ) {
      rawMarkdown = stripControlChars(buf.toString("utf-8")).trim();
    } else if (
      normalizedMime === "text/csv" ||
      lowerName.endsWith(".csv")
    ) {
      const csvRes = csvToMarkdown(buf.toString("utf-8"));
      rawMarkdown = csvRes.markdown;
      csvTruncated = csvRes.truncated;
      totalRows = csvRes.totalRows;
    } else if (
      normalizedMime === "text/plain" ||
      lowerName.endsWith(".txt")
    ) {
      rawMarkdown = stripControlChars(buf.toString("utf-8")).trim();
    } else if (
      normalizedMime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx")
    ) {
      rawMarkdown = await docxToMarkdown(buf);
    } else if (
      normalizedMime === "application/pdf" ||
      lowerName.endsWith(".pdf")
    ) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      pageCount = pdf.numPages;

      if (pageCount > maxPages) {
        throw new DocumentExtractionError(
          "document_page_limit",
          `PDF exceeds maximum allowed page count of ${maxPages} pages (has ${pageCount})`,
          { maxPages, pageCount }
        );
      }

      const extracted = await extractText(pdf, { mergePages: false });
      const pages: string[] = Array.isArray(extracted.text)
        ? extracted.text
        : [String(extracted.text ?? "")];

      const joinedPages = pages
        .map((p) => joinPdfPageParagraphs(p))
        .filter((p) => p.length > 0);

      rawMarkdown = joinedPages.join("\n\n---\n\n");
    } else {
      throw new DocumentExtractionError(
        "document_type_unsupported",
        `Unsupported document type for Markdown extraction: ${mime}`
      );
    }

    let truncated = csvTruncated;
    let finalMarkdown = rawMarkdown;

    if (finalMarkdown.length > maxChars) {
      finalMarkdown = finalMarkdown.slice(0, maxChars);
      truncated = true;
    }

    return {
      markdown: finalMarkdown,
      truncated,
      ...(pageCount !== undefined ? { pageCount } : {}),
      ...(totalRows !== undefined ? { totalRows } : {}),
    };
  })();

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
