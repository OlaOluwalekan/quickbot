/**
 * File types that can be added to a workspace as a document (F3.1).
 *
 * PDF is not in the list (owner decision, 2026-11-12): only its text can be
 * extracted, so columns, tables and formulas come out scrambled and the result
 * can't be edited and downloaded as a corrected file. A PDF can still be
 * attached to a message. The same list is used by the composer and re-checked
 * by the server.
 */
const DOCUMENT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const DOCUMENT_EXTENSION = /\.(txt|md|markdown|csv|docx)$/i;

/** Value for the `accept` attribute of the "add as a document" file input. */
export const WORKSPACE_DOCUMENT_ACCEPT = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".docx",
  ...DOCUMENT_MIMES,
].join(",");

export function isPdfFile(file: { name: string; type: string }): boolean {
  return (
    file.type.toLowerCase() === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isWorkspaceDocumentFile(file: {
  name: string;
  type: string;
}): boolean {
  if (isPdfFile(file)) return false;
  return (
    DOCUMENT_EXTENSION.test(file.name) ||
    DOCUMENT_MIMES.has(file.type.toLowerCase())
  );
}

/** Rows of a CSV file shown in the document; the rest is left out. */
export const MAX_CSV_ROWS = 200;

/**
 * Documents one workspace can hold (owner decision, 2026-11-12). Every
 * document is sent with each prompt and is never dropped from the AI's
 * context, so the number is kept small to bound the input tokens.
 */
export const MAX_WORKSPACE_DOCUMENTS = 3;
