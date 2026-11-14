"use client";

import { create } from "zustand";

const PINNED_KEY = "klecx-sidebar-pinned";

function readPinned(): boolean {
  try {
    return window.localStorage.getItem(PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

interface SidebarAutoState {
  /** Set by the column layout: the open columns need the sidebar's room. */
  columnsNeedRoom: boolean;
  /** Pinned open with the toggle; remembered in this browser. */
  pinnedOpen: boolean;
  /** Read the remembered pin (after hydration, so server and client agree). */
  hydratePinned: () => void;
  setColumnsNeedRoom: (v: boolean) => void;
  setPinnedOpen: (v: boolean) => void;
}

export const useSidebarAutoStore = create<SidebarAutoState>((set, get) => ({
  columnsNeedRoom: false,
  pinnedOpen: false,
  hydratePinned: () => set({ pinnedOpen: readPinned() }),
  setColumnsNeedRoom: (v) => {
    if (get().columnsNeedRoom !== v) set({ columnsNeedRoom: v });
  },
  setPinnedOpen: (v) => {
    try {
      if (v) window.localStorage.setItem(PINNED_KEY, "1");
      else window.localStorage.removeItem(PINNED_KEY);
    } catch {
      // Not remembered; still applies until reload.
    }
    set({ pinnedOpen: v });
  },
}));
