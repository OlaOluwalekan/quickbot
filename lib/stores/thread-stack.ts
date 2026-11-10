import { create } from "zustand";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  type StackEntry,
  parseThreadParam,
  serializeThreadParam,
} from "@/lib/annotations/thread-stack";
import { api } from "@/lib/api/client";

export interface ThreadStackState {
  stack: StackEntry[];
  /** Quoted passage per annotation id, for spine and breadcrumb labels. */
  quotes: Record<string, string>;
  /**
   * Opens an entry as the column right after column `fromIndex` (0 = main
   * conversation), closing every column that was open after it. Without
   * `fromIndex` the entry is added after the last open column.
   */
  open: (entry: StackEntry, options?: { fromIndex?: number }) => void;
  setStack: (stack: StackEntry[]) => void;
  back: () => void;
  closeAll: () => void;
  /** Keeps columns up to `index` (0 = main conversation only). */
  goTo: (index: number) => void;
  rememberQuotes: (items: Array<{ id: string; quote: string }>) => void;
}

export const useThreadStackStore = create<ThreadStackState>((set) => ({
  stack: [],
  quotes: {},

  open: (entry, options) =>
    set((state) => {
      const base =
        options?.fromIndex !== undefined
          ? state.stack.slice(0, Math.max(0, options.fromIndex))
          : state.stack;

      // Already open: show it as the last column instead of adding it twice.
      const existingIdx = base.findIndex(
        (s) => s.kind === entry.kind && s.id === entry.id
      );
      if (existingIdx !== -1) {
        return { stack: base.slice(0, existingIdx + 1) };
      }
      return { stack: [...base, entry] };
    }),

  setStack: (stack) => set({ stack }),

  back: () => set((state) => ({ stack: state.stack.slice(0, -1) })),

  closeAll: () => set({ stack: [] }),

  goTo: (index) =>
    set((state) => ({ stack: index <= 0 ? [] : state.stack.slice(0, index) })),

  rememberQuotes: (items) =>
    set((state) => {
      const changed = items.filter((i) => state.quotes[i.id] !== i.quote);
      if (changed.length === 0) return state;
      const quotes = { ...state.quotes };
      for (const i of changed) quotes[i.id] = i.quote;
      return { quotes };
    }),
}));

/**
 * Opens the column of an annotation from outside the column stack (drawer,
 * queue, Klecx notes, deep links). A nested annotation opens with its whole
 * ancestor chain, so the columns to its left are the threads it sits in.
 */
export async function openAnnotationThread(annotationId: string): Promise<void> {
  const store = useThreadStackStore.getState();
  try {
    const chain = await api<Array<{ id: string; anchorExact?: string }>>(
      `/api/v1/annotations/${annotationId}/chain`
    );
    if (Array.isArray(chain) && chain.length > 0) {
      store.rememberQuotes(
        chain.map((c) => ({ id: c.id, quote: c.anchorExact ?? "" }))
      );
      store.setStack(chain.map((c) => ({ kind: "annotation", id: c.id })));
      return;
    }
  } catch {
    // Fall through: the column itself shows the "not available" state.
  }
  store.setStack([{ kind: "annotation", id: annotationId }]);
}

/**
 * Keeps the column stack and the `?thread=` search param in sync.
 *
 * - URL → store: on load (deep link / reload) and whenever the param changes,
 *   which includes the browser's Back and Forward buttons.
 * - Store → URL: every change made in the UI adds a history entry, so the
 *   browser's Back button closes one level. `history.pushState` is used
 *   instead of the router so the page isn't fetched again from the server.
 *
 * `lastSynced` holds the value both sides last agreed on; it is what stops
 * one direction from echoing the other.
 */
export function useThreadStackUrlSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const threadParam = searchParams?.get("thread") ?? "";

  const lastSynced = useRef<string | null>(null);
  const lastPath = useRef<string | null>(null);

  // URL → store
  useEffect(() => {
    const pathChanged = lastPath.current !== pathname;
    lastPath.current = pathname;
    if (!pathChanged && lastSynced.current === threadParam) return;

    lastSynced.current = threadParam;
    const store = useThreadStackStore.getState();
    if (serializeThreadParam(store.stack) !== threadParam) {
      store.setStack(parseThreadParam(threadParam));
    }
  }, [pathname, threadParam]);

  // Store → URL
  useEffect(() => {
    const unsubscribe = useThreadStackStore.subscribe((state, prev) => {
      if (state.stack === prev.stack) return;
      const next = serializeThreadParam(state.stack);
      if (next === lastSynced.current) return;
      lastSynced.current = next;

      if (typeof window === "undefined") return;
      try {
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("thread", next);
        else url.searchParams.delete("thread");
        window.history.pushState(null, "", url.toString());
      } catch {
        // The stack still works without the URL.
      }
    });
    return unsubscribe;
  }, []);

  // Columns belong to the workspace page that opened them.
  useEffect(() => {
    return () => {
      lastSynced.current = null;
      useThreadStackStore.getState().closeAll();
    };
  }, []);
}
