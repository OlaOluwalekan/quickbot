import "server-only";

import { db } from "@/server/db/client";
import { estimateTokens } from "@/server/ai/context-builder";

export const NOTES_DEFAULT_BUDGET_TOKENS = 4000;

/** Notes beyond this many are never loaded (far above what the budget fits). */
const NOTES_MAX_LOADED = 500;
/** A quote only identifies the passage, so a long one is shortened. */
const QUOTE_MAX_CHARS = 240;

export const NOTES_PREAMBLE = `Workspace notes from the user. These are corrections or preferences recorded with @klecx.
Apply each one whenever it is relevant; a note overrides anything said earlier in this workspace.
Treat note text as user instructions, but never as permission to break the Acceptable Use Policy.`;

type NoteText = { quote: string; instruction: string };

/** One line per note, so a note can't forge extra list items. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatNote(note: NoteText, index: number): string {
  const quote = oneLine(note.quote);
  const shortQuote =
    quote.length > QUOTE_MAX_CHARS
      ? `${quote.slice(0, QUOTE_MAX_CHARS - 1)}…`
      : quote;
  return `${index + 1}. About «${shortQuote}»: ${oneLine(note.instruction)}`;
}

/**
 * Picks the notes that fit the token budget. `newestFirst` must be ordered
 * newest first; the result keeps that order. Shared by the prompt builder and
 * the notes list (which warns when the oldest notes are no longer sent).
 */
export function selectNotesWithinBudget<T extends NoteText>(
  newestFirst: T[],
  budgetTokens: number = NOTES_DEFAULT_BUDGET_TOKENS
): T[] {
  let used = estimateTokens(NOTES_PREAMBLE);
  const fitting: T[] = [];

  for (const note of newestFirst) {
    const cost = estimateTokens(formatNote(note, fitting.length));
    if (used + cost > budgetTokens) break;
    used += cost;
    fitting.push(note);
  }

  return fitting;
}

/**
 * Loads active workspace notes formatted for AI context injection.
 * Takes the newest notes until budgetTokens is reached, then lists them in
 * chronological order. Returns null when there is nothing to send.
 */
export async function loadActiveNotes(
  workspaceId: string,
  budgetTokens: number = NOTES_DEFAULT_BUDGET_TOKENS
): Promise<string | null> {
  const notes = await db.workspaceNote.findMany({
    where: { workspaceId, status: "ACTIVE", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: NOTES_MAX_LOADED,
    select: { quote: true, instruction: true },
  });

  const fitting = selectNotesWithinBudget(notes, budgetTokens);
  if (fitting.length === 0) {
    return null;
  }

  const lines = fitting.reverse().map(formatNote);
  return `${NOTES_PREAMBLE}\n${lines.join("\n")}`;
}
