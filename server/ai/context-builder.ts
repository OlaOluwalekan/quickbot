import "server-only";
import { db } from "@/server/db/client";
import { getModel } from "./registry";
import { buildSystemPrompt } from "./prompts/system";
import type { Msg, Part } from "./types";

export type BuildContextArgs = {
  workspaceId: string;
  upToResponseId?: string;
  newPrompt: string;
  modelKey: string;
  language: string;
  attachments?: Part[];
  reservedOutputTokens?: number;
  excludeUpToResponseId?: boolean;
};

export type BuildContextResult = {
  system: string;
  messages: Msg[];
  truncated: boolean;
};

export interface ContextTurn {
  responseId: string;
  prompt: string;
  assistantText: string;
}

/**
 * Estimates token count as chars / 4 (rounded up).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimatePartTokens(part: Part): number {
  if (part.type === "text") {
    return estimateTokens(part.text);
  }
  // Standard multimodal attachment token estimate (e.g. Gemini 258 tokens)
  return 258;
}

/**
 * Pure function to assemble messages and apply token budget truncation.
 * Always keeps the first turn (turn 0) and the last 4 turns.
 * Drops the oldest intermediate turns first when budget is exceeded.
 */
export function assembleContextMessages(args: {
  turns: ContextTurn[];
  newPrompt: string;
  attachments?: Part[];
  systemTokens: number;
  maxInputTokens: number;
  reservedOutputTokens?: number;
}): { messages: Msg[]; truncated: boolean } {
  const reservedOutput = args.reservedOutputTokens ?? 4096;

  // New prompt tokens
  let newPromptTokens = estimateTokens(args.newPrompt);
  if (args.attachments) {
    for (const part of args.attachments) {
      newPromptTokens += estimatePartTokens(part);
    }
  }

  // Token budget = model.maxInput - system - reservedOutput - 10%
  const totalBudget = Math.floor(args.maxInputTokens * 0.9) - args.systemTokens - reservedOutput;
  const historyBudget = totalBudget - newPromptTokens;

  const turns = args.turns;
  const totalTurns = turns.length;
  let truncated = false;

  const turnCosts = turns.map(
    (t) => estimateTokens(t.prompt) + estimateTokens(t.assistantText)
  );

  let currentHistoryTokens = turnCosts.reduce((sum, cost) => sum + cost, 0);

  const keptIndices = new Set<number>(turns.map((_, i) => i));

  // If budget exceeded and we have intermediate droppable turns (turns > 5)
  // Drop oldest complete turns first (between index 1 and totalTurns - 5)
  if (currentHistoryTokens > historyBudget && totalTurns > 5) {
    const droppableEndIndex = totalTurns - 5; // index before the last 4 turns
    for (let i = 1; i <= droppableEndIndex; i++) {
      if (currentHistoryTokens <= historyBudget) {
        break;
      }
      const cost = turnCosts[i] ?? 0;
      currentHistoryTokens -= cost;
      keptIndices.delete(i);
      truncated = true;
    }
  }

  // Build the message sequence from kept turns
  const messages: Msg[] = [];
  for (let i = 0; i < totalTurns; i++) {
    if (!keptIndices.has(i)) continue;
    const turn = turns[i]!;
    messages.push({
      role: "user",
      parts: [{ type: "text", text: turn.prompt }],
    });
    messages.push({
      role: "assistant",
      parts: [{ type: "text", text: turn.assistantText }],
    });
  }

  // Append the new user message (+ attachments)
  const newUserParts: Part[] = [];
  if (args.attachments && args.attachments.length > 0) {
    newUserParts.push(...args.attachments);
  }
  newUserParts.push({ type: "text", text: args.newPrompt });
  messages.push({ role: "user", parts: newUserParts });

  return { messages, truncated };
}

/**
 * Builds the context for the model from workspace response history.
 * 1) Loads responses in (sortAt, id) order up to upToResponseId (using active version / latest edit).
 * 2) Applies token budget truncation (drops oldest intermediate turns, preserves turn 1 and last 4).
 * 3) Appends new user message (+ attachments).
 * 4) Returns { system, messages, truncated }.
 */
export async function buildContext(args: BuildContextArgs): Promise<BuildContextResult> {
  const model = getModel(args.modelKey);
  const systemPrompt = buildSystemPrompt(args.language);
  const systemTokens = estimateTokens(systemPrompt);

  // 1) Load responses in (sortAt, id) order for this workspace
  const allResponses = await db.response.findMany({
    where: {
      workspaceId: args.workspaceId,
      deletedAt: null,
    },
    orderBy: [
      { sortAt: "asc" },
      { id: "asc" },
    ],
    include: {
      versions: {
        include: {
          edits: {
            orderBy: { revision: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  // Filter responses up to upToResponseId
  let responses = allResponses;
  if (args.upToResponseId) {
    const target = allResponses.find((r) => r.id === args.upToResponseId);
    if (target) {
      const targetTime = target.sortAt.getTime();
      const targetId = target.id;

      responses = allResponses.filter((r) => {
        const rTime = r.sortAt.getTime();
        if (args.excludeUpToResponseId) {
          return rTime < targetTime || (rTime === targetTime && r.id < targetId);
        }
        return rTime < targetTime || (rTime === targetTime && r.id <= targetId);
      });
    }
  }

  // Extract prompt + active version text (or latest edit if exists)
  const turns: ContextTurn[] = [];
  for (const resp of responses) {
    let activeVersion = resp.activeVersionId
      ? resp.versions.find((v) => v.id === resp.activeVersionId)
      : undefined;

    if (!activeVersion && resp.versions.length > 0) {
      activeVersion = [...resp.versions].sort((a, b) => b.number - a.number)[0];
    }

    const latestEdit = activeVersion?.edits[0];
    const assistantText = latestEdit?.content ?? activeVersion?.content ?? "";

    turns.push({
      responseId: resp.id,
      prompt: resp.prompt,
      assistantText,
    });
  }

  // 2) Token budget truncation & message assembly
  const { messages, truncated } = assembleContextMessages({
    turns,
    newPrompt: args.newPrompt,
    attachments: args.attachments,
    systemTokens,
    maxInputTokens: model.maxInput,
    reservedOutputTokens: args.reservedOutputTokens,
  });

  return {
    system: systemPrompt,
    messages,
    truncated,
  };
}
