"use client";

import { create } from "zustand";

export interface BatchQuestion {
  id: string;
  depth: number;
  quote: string;
  question: string;
  state: "answering" | "answered" | "failed";
  answer?: string;
  /** Id of the saved answer: what highlights inside it are anchored to. */
  messageId?: string;
}

export interface LiveBatch {
  status: "running" | "done" | "failed";
  questions: BatchQuestion[];
}

interface QuestionBatchState {
  /** "Ask all" runs started in this tab, by generation id. */
  batches: Record<string, LiveBatch>;
  begin: (generationId: string, questions: Omit<BatchQuestion, "state">[]) => void;
  answer: (generationId: string, id: string, answer: string, messageId: string) => void;
  fail: (generationId: string, id: string) => void;
  /** Ends the run: whatever is still waiting did not get an answer. */
  finish: (generationId: string, status: "done" | "failed") => void;
}

const patch = (
  state: QuestionBatchState,
  generationId: string,
  change: (batch: LiveBatch) => LiveBatch
) => {
  const batch = state.batches[generationId];
  if (!batch) return state;
  return { batches: { ...state.batches, [generationId]: change(batch) } };
};

/**
 * Answers of the question queue while they arrive. The saved answers are
 * loaded from the server when the column is opened later (reload, link).
 */
export const useQuestionBatchStore = create<QuestionBatchState>((set) => ({
  batches: {},
  begin: (generationId, questions) =>
    set((s) => ({
      batches: {
        ...s.batches,
        [generationId]: {
          status: "running",
          questions: questions.map((q) => ({ ...q, state: "answering" })),
        },
      },
    })),
  answer: (generationId, id, answer, messageId) =>
    set((s) =>
      patch(s, generationId, (b) => ({
        ...b,
        questions: b.questions.map((q) =>
          q.id === id ? { ...q, state: "answered", answer, messageId } : q
        ),
      }))
    ),
  fail: (generationId, id) =>
    set((s) =>
      patch(s, generationId, (b) => ({
        ...b,
        questions: b.questions.map((q) => (q.id === id ? { ...q, state: "failed" } : q)),
      }))
    ),
  finish: (generationId, status) =>
    set((s) =>
      patch(s, generationId, (b) => ({
        status,
        questions: b.questions.map((q) =>
          q.state === "answering" ? { ...q, state: "failed" } : q
        ),
      }))
    ),
}));
