import mammoth from "mammoth";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export const MAX_EXTRACTED_CHARS = 200_000;
export const MAX_PDF_PAGES = 100;
export const EXTRACTION_TIMEOUT_MS = 10_000;
export const MAX_CSV_ROWS = 200;

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

  const lines = [headerLine, dividerLine, ...visibleRows];
  const isTruncated = totalRows > MAX_CSV_ROWS;

  if (isTruncated) {
    lines.push("", `Showing ${MAX_CSV_ROWS} of ${totalRows} rows.`);
  }

  return {
    markdown: lines.join("\n"),
    truncated: isTruncated,
    totalRows,
  };
}

function sanitizeMarkdownHtml(md: string): string {
  // Remove dangerous HTML blocks completely
  let cleaned = md
    .replace(/<(script|style|iframe|object|embed|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|noscript)\b[^>]*\/?>/gi, "");

  // Strip any remaining raw HTML tags while keeping inner text
  cleaned = cleaned.replace(/<\/?[a-zA-Z][^>\n]*>/g, "");
  return cleaned;
}

async function docxToMarkdown(buf: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: buf },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        // Ignore binary image payload, preserve alt text only
        const alt = (image as { altText?: string }).altText || "";
        return { src: "", alt };
      }),
    }
  );

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  turndown.use(gfm);
  turndown.remove(["script", "style", "iframe", "object", "embed", "noscript"]);

  // Replace images with alt-text placeholder or omit if no alt text
  turndown.addRule("ignoreBinaryImages", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = (node as { getAttribute?: (k: string) => string | null })
        .getAttribute?.("alt")
        ?.trim();
      return alt ? `[Image: ${alt}]` : "";
    },
  });

  const rawMd = turndown.turndown(result.value || "");
  return sanitizeMarkdownHtml(stripControlChars(rawMd)).trim();
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
      reject(new Error(`Document extraction timed out after ${timeoutMs}ms`));
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
        throw new Error(
          `PDF exceeds maximum allowed page count of ${maxPages} pages (has ${pageCount})`
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
      throw new Error(`Unsupported document type for Markdown extraction: ${mime}`);
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
