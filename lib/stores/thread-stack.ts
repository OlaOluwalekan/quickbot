import { create } from "zustand";
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type StackEntry,
  parseThreadParam,
  serializeThreadParam,
} from "@/lib/annotations/thread-stack";

export interface ThreadStackState {
  stack: StackEntry[];
  open: (entry: StackEntry, options?: { fromIndex?: number }) => void;
  setStack: (stack: StackEntry[]) => void;
  back: () => void;
  closeAll: () => void;
  goTo: (index: number) => void;
}

export const useThreadStackStore = create<ThreadStackState>((set) => ({
  stack: [],

  open: (entry, options) =>
    set((state) => {
      if (options?.fromIndex !== undefined) {
        // Truncate stack up to fromIndex (keep 0..fromIndex - 1), then push entry
        const next = state.stack.slice(0, Math.max(0, options.fromIndex));
        return { stack: [...next, entry] };
      }

      // If entry already in stack, truncate up to it
      const existingIdx = state.stack.findIndex((s) => s.id === entry.id);
      if (existingIdx !== -1) {
        return { stack: state.stack.slice(0, existingIdx + 1) };
      }

      return { stack: [...state.stack, entry] };
    }),

  setStack: (stack) => set({ stack }),

  back: () =>
    set((state) => ({
      stack: state.stack.length > 0 ? state.stack.slice(0, -1) : [],
    })),

  closeAll: () => set({ stack: [] }),

  goTo: (index) =>
    set((state) => {
      // Index 0 represents main conversation
      if (index <= 0) {
        return { stack: [] };
      }
      // Index 1 corresponds to stack[0], index k corresponds to stack[k-1]
      // Going to column `index` keeps stack entries up to `index` (i.e. length = index)
      return { stack: state.stack.slice(0, index) };
    }),
}));

/**
 * Hook to synchronize the thread stack store with the `?thread=` URL search param.
 * - Reads `?thread=` on mount and popstate, restoring the stack.
 * - Updates the URL with `router.replace(..., { scroll: false })` when stack changes.
 * - Supports browser Back/Forward navigation.
 */
export function useThreadStackUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const stack = useThreadStackStore((s) => s.stack);
  const setStack = useThreadStackStore((s) => s.setStack);

  const isInternalUpdate = useRef(false);

  // Sync from URL to store on mount and URL changes
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    const threadParam = searchParams.get("thread");
    const parsed = parseThreadParam(threadParam);
    const currentSerialized = serializeThreadParam(useThreadStackStore.getState().stack);
    const newSerialized = serializeThreadParam(parsed);

    if (currentSerialized !== newSerialized) {
      setStack(parsed);
    }
  }, [searchParams, setStack]);

  // Sync from store to URL when stack changes
  useEffect(() => {
    const threadParam = searchParams.get("thread");
    const currentParam = threadParam || "";
    const newParam = serializeThreadParam(stack);

    if (currentParam === newParam) {
      return;
    }

    isInternalUpdate.current = true;

    const params = new URLSearchParams(searchParams.toString());
    if (newParam) {
      params.set("thread", newParam);
    } else {
      params.delete("thread");
    }

    const queryStr = params.toString();
    const targetUrl = queryStr ? `${pathname}?${queryStr}` : pathname;

    router.replace(targetUrl, { scroll: false });
  }, [stack, pathname, router, searchParams]);

  // Handle browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const threadParam = url.searchParams.get("thread");
      const parsed = parseThreadParam(threadParam);
      setStack(parsed);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [setStack]);
}
