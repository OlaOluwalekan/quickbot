/**
 * Shared text normalization between client and server for TextQuoteSelector anchoring.
 * Strips zero-width chars and normalizes whitespace while preserving text characters.
 */
export function normalizeTextForAnchor(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function cleanQuoteText(text: string): string {
  if (!text) return "";
  return normalizeTextForAnchor(text).trim();
}
