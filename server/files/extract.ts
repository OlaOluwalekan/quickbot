import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const MAX_EXTRACTED_CHARS = 200_000;
export const MAX_PDF_PAGES = 100;
export const EXTRACTION_TIMEOUT_MS = 10_000;

export interface ExtractionResult {
  text: string;
  truncated: boolean;
  pageCount?: number;
}

/**
 * Extracts raw textual content from document buffers (PDF, DOCX, TXT, MD, CSV)
 * with strict safety timeouts (10s), page limits (100 pages), and character caps (200,000 chars).
 */
export async function extractDocumentText(
  buffer: Buffer,
  mime: string,
  options?: { maxPages?: number; maxChars?: number; timeoutMs?: number }
): Promise<ExtractionResult> {
  const maxChars = options?.maxChars ?? MAX_EXTRACTED_CHARS;
  const maxPages = options?.maxPages ?? MAX_PDF_PAGES;
  const timeoutMs = options?.timeoutMs ?? EXTRACTION_TIMEOUT_MS;

  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Text extraction timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const extractionPromise = (async (): Promise<ExtractionResult> => {
    let rawText = "";
    let pageCount: number | undefined;

    const lower = mime.toLowerCase();
    const isPdf = lower.includes("pdf");
    const isDocx = lower.includes("word") || lower.endsWith(".docx");
    const isText =
      lower.includes("text") ||
      lower.includes("markdown") ||
      lower.includes("csv") ||
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".csv");

    if (isPdf) {
      const uint8 = new Uint8Array(buffer);
      const pdf = await getDocumentProxy(uint8);
      pageCount = pdf.numPages;

      if (pageCount > maxPages) {
        throw new Error(
          `PDF exceeds maximum allowed page count of ${maxPages} pages (has ${pageCount})`
        );
      }

      const extracted = await extractText(pdf, { mergePages: true });
      const textVal = extracted.text;
      rawText = Array.isArray(textVal) ? textVal.join("\n") : String(textVal || "");
    } else if (isDocx) {
      const res = await mammoth.extractRawText({ buffer });
      rawText = res.value || "";
    } else if (isText) {
      rawText = buffer.toString("utf-8");
    } else {
      return { text: "", truncated: false };
    }

    const truncated = rawText.length > maxChars;
    let cleanText = truncated ? rawText.slice(0, maxChars) : rawText;

    if (truncated) {
      cleanText += `\n\n[... text truncated at ${maxChars.toLocaleString()} characters ...]`;
    }

    return {
      text: cleanText,
      truncated,
      pageCount,
    };
  })();

  try {
    const result = await Promise.race([extractionPromise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
