"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import {
  applySuggestion,
  type ApplySuggestionResult,
  type SuggestionTarget,
} from "@/lib/documents/apply-suggestion";

export interface DocumentDraft {
  /** Revision the draft started from (null = the original text). */
  baseRevision: number | null;
  /** Saved text the draft started from: needed to re-apply the changes after a conflict. */
  baseContent: string;
  content: string;
  appliedSuggestionIds: string[];
  changeCount: number;
}

interface DocumentDraftsState {
  drafts: Record<string, DocumentDraft>;
  setDraft: (versionId: string, draft: DocumentDraft) => void;
  updateDraftContent: (args: {
    versionId: string;
    baseRevision: number | null;
    baseContent: string;
    content: string;
    appliedSuggestionIds?: string[];
    incrementChangeCount?: boolean;
  }) => void;
  applyFixToDraft: (args: {
    versionId: string;
    baseRevision: number | null;
    baseContent: string;
    suggestionId: string;
    suggestion: SuggestionTarget;
  }) => ApplySuggestionResult;
  discardDraft: (versionId: string) => void;
  clearDraft: (versionId: string) => void;
}

const memoryFallback = new Map<string, string>();

const safeSessionStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage.getItem(name);
      }
    } catch {
      // ignore storage access errors
    }
    return memoryFallback.get(name) ?? null;
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(name, value);
        return;
      }
    } catch {
      // Quota or security error: keep the draft in memory, and drop the stored
      // copy so a reload can't bring back an older draft.
      try {
        window.sessionStorage.removeItem(name);
      } catch {
        // ignore
      }
    }
    memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(name);
        return;
      }
    } catch {
      // ignore
    }
    memoryFallback.delete(name);
  },
};

export const useDocumentDraftsStore = create<DocumentDraftsState>()(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (versionId, draft) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [versionId]: draft,
          },
        })),

      updateDraftContent: ({
        versionId,
        baseRevision,
        baseContent,
        content,
        appliedSuggestionIds,
        incrementChangeCount = true,
      }) =>
        set((state) => {
          const existing = state.drafts[versionId];
          const startedFrom = existing ? existing.baseContent : baseContent;
          // Back to the saved text: nothing left to save.
          if (content === startedFrom) {
            if (!existing) return state;
            const next = { ...state.drafts };
            delete next[versionId];
            return { drafts: next };
          }
          const nextCount = incrementChangeCount
            ? (existing?.changeCount ?? 0) + 1
            : (existing?.changeCount ?? 1);
          return {
            drafts: {
              ...state.drafts,
              [versionId]: {
                baseRevision: existing ? existing.baseRevision : baseRevision,
                baseContent: startedFrom,
                content,
                appliedSuggestionIds:
                  appliedSuggestionIds ?? existing?.appliedSuggestionIds ?? [],
                changeCount: Math.max(1, nextCount),
              },
            },
          };
        }),

      applyFixToDraft: ({
        versionId,
        baseRevision,
        baseContent,
        suggestionId,
        suggestion,
      }) => {
        const existing = get().drafts[versionId];
        const currentSource = existing ? existing.content : baseContent;
        const res = applySuggestion(currentSource, suggestion);
        if (!res.ok) {
          return res;
        }

        const prevIds = existing?.appliedSuggestionIds ?? [];
        const nextIds = prevIds.includes(suggestionId)
          ? prevIds
          : [...prevIds, suggestionId];

        set((state) => ({
          drafts: {
            ...state.drafts,
            [versionId]: {
              baseRevision: existing ? existing.baseRevision : baseRevision,
              baseContent: existing ? existing.baseContent : baseContent,
              content: res.next,
              appliedSuggestionIds: nextIds,
              changeCount: (existing?.changeCount ?? 0) + 1,
            },
          },
        }));

        return res;
      },

      discardDraft: (versionId) =>
        set((state) => {
          if (!(versionId in state.drafts)) return state;
          const next = { ...state.drafts };
          delete next[versionId];
          return { drafts: next };
        }),

      clearDraft: (versionId) =>
        set((state) => {
          if (!(versionId in state.drafts)) return state;
          const next = { ...state.drafts };
          delete next[versionId];
          return { drafts: next };
        }),
    }),
    {
      name: "klecx-document-drafts-v1",
      storage: createJSONStorage(() => safeSessionStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    }
  )
);
