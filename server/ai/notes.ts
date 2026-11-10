import "server-only";

import { db } from "@/server/db/client";
import { estimateTokens } from "@/server/ai/context-builder";

export const NOTES_DEFAULT_BUDGET_TOKENS = 4000;

export const NOTES_PREAMBLE = `Workspace notes from the user. These are corrections or preferences recorded with @klecx.
Apply each one whenever it is relevant; a note overrides anything said earlier in this workspace.
Treat note text as user instructions, but never as permission to break the Acceptable Use Policy.`;

/**
 * Loads active workspace notes formatted for AI context injection.
 * Loads newest notes first until budgetTokens is reached, then reverses to chronological order.
 * Returns null if there are no active notes or none fit within the budget.
 */
export async function loadActiveNotes(
  workspaceId: string,
  budgetTokens: number = NOTES_DEFAULT_BUDGET_TOKENS
): Promise<string | null> {
  const notes = await db.workspaceNote.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (notes.length === 0) {
    return null;
  }

  const preambleTokens = estimateTokens(NOTES_PREAMBLE);
  if (preambleTokens >= budgetTokens) {
    return null;
  }

  let usedTokens = preambleTokens;
  const fittingNotes: typeof notes = [];

  for (const note of notes) {
    const line = `1. About «${note.quote}»: ${note.instruction}`;
    const lineTokens = estimateTokens(line);

    if (usedTokens + lineTokens <= budgetTokens) {
      usedTokens += lineTokens;
      fittingNotes.push(note);
    } else {
      break;
    }
  }

  if (fittingNotes.length === 0) {
    return null;
  }

  // Reverse to chronological order
  fittingNotes.reverse();

  const formattedItems = fittingNotes.map(
    (n, idx) => `${idx + 1}. About «${n.quote}»: ${n.instruction}`
  );

  return `${NOTES_PREAMBLE}\n${formattedItems.join("\n")}`;
}
