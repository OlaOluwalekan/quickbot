"use client";

import { create } from "zustand";

export interface ReviewRun {
  section: number;
  totalSections: number;
  /** Findings saved so far. */
  found: number;
}

interface DocumentReviewState {
  /** Reviews in progress in this tab, by response version. */
  runs: Record<string, ReviewRun>;
  start: (versionId: string) => void;
  update: (versionId: string, patch: Partial<ReviewRun>) => void;
  finish: (versionId: string) => void;
}

/**
 * Reviews started from this tab. The review itself runs on the server; this
 * only drives the "Reviewing section 2 of 5…" line, wherever the review was
 * started from (document card or the response's menu).
 */
export const useDocumentReviewStore = create<DocumentReviewState>((set) => ({
  runs: {},
  start: (versionId) =>
    set((s) => ({
      runs: { ...s.runs, [versionId]: { section: 0, totalSections: 0, found: 0 } },
    })),
  update: (versionId, patch) =>
    set((s) => {
      const run = s.runs[versionId];
      if (!run) return s;
      return { runs: { ...s.runs, [versionId]: { ...run, ...patch } } };
    }),
  finish: (versionId) =>
    set((s) => {
      if (!(versionId in s.runs)) return s;
      const runs = { ...s.runs };
      delete runs[versionId];
      return { runs };
    }),
}));
