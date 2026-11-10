import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const SIDEBAR_COOKIE_NAME = "sidebar";

export function writeSidebarCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  const value = collapsed ? "collapsed" : "expanded";
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function parseSidebarCookie(raw?: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return (
    normalized === "collapsed" || normalized === "true" || normalized === "1"
  );
}

export interface PersistedUiSlice {
  sidebarCollapsed: boolean;
  composerEnterToSend: boolean;
  onboardingDismissed: boolean;
  drafts: Record<string, string>;
}

export interface UiState extends PersistedUiSlice {
  rightPanelOpen: boolean;
  rightPanelWidth: number;

  // Actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelWidth: (width: number) => void;
  toggleRightPanelOpen: () => void;
  setComposerEnterToSend: (enterToSend: boolean) => void;
  setOnboardingDismissed: (dismissed: boolean) => void;
  setDraft: (workspaceId: string, text: string) => void;
  clearDraft: (workspaceId: string) => void;
  clearAllDrafts: () => void;

  // Compatibility stubs for legacy v1 components
  addOptimisticResponse: (response: unknown) => void;
  setDialogData: (data: unknown) => void;

  // Transient UI state (never persisted to localStorage)
  mobileNavIsOpen: boolean;
  commandPaletteOpen: boolean;
  profileDialogIsOpen: boolean;
  codeTheme: "light" | "dark";
  currentPageTitle: string;
  currentPageId: string | null;
  currentProjectId: string | null;
  currentProjectName: string | null;
  chatMode: "text" | "image";
  rightPanelFocus: {
    annotationId?: string;
    responseId?: string;
    versionId?: string;
    tab?: "comments" | "replies" | "questions";
  } | null;

  // Transient actions
  toggleMobileNavOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleProfileDialogOpen: (open: boolean) => void;
  setCodeTheme: (theme: "light" | "dark") => void;
  setCurrentPageTitle: (title: string) => void;
  setCurrentPageId: (id: string | null) => void;
  setCurrentProject: (project: {
    id: string | null;
    name: string | null;
  }) => void;
  setChatMode: (mode: "text" | "image") => void;
  setRightPanelFocus: (
    focus: {
      annotationId?: string;
      responseId?: string;
      versionId?: string;
      tab?: "comments" | "replies" | "questions";
    } | null
  ) => void;
  resetTransientUi: () => void;
}

const initialTransientState = {
  rightPanelOpen: false,
  mobileNavIsOpen: false,
  commandPaletteOpen: false,
  profileDialogIsOpen: false,
  codeTheme: "light" as const,
  currentPageTitle: "",
  currentPageId: null as string | null,
  currentProjectId: null as string | null,
  currentProjectName: null as string | null,
  chatMode: "text" as const,
  rightPanelFocus: null as {
    annotationId?: string;
    responseId?: string;
    versionId?: string;
    tab?: "comments" | "replies" | "questions";
  } | null,
};

export function partializeUiState(state: UiState): PersistedUiSlice {
  return {
    sidebarCollapsed: state.sidebarCollapsed,
    composerEnterToSend: state.composerEnterToSend,
    onboardingDismissed: state.onboardingDismissed,
    drafts: state.drafts,
  };
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      rightPanelWidth:
        typeof window !== "undefined" && window.localStorage?.getItem("klecx-panel-width")
          ? Number(window.localStorage.getItem("klecx-panel-width")) || 360
          : 360,
      composerEnterToSend: true,
      onboardingDismissed: false,
      drafts: {},

      addOptimisticResponse: () => {},
      setDialogData: () => {},

      ...initialTransientState,

      setSidebarCollapsed: (sidebarCollapsed) => {
        writeSidebarCookie(sidebarCollapsed);
        set({ sidebarCollapsed });
      },
      toggleSidebarCollapsed: () =>
        set((state) => {
          const next = !state.sidebarCollapsed;
          writeSidebarCookie(next);
          return { sidebarCollapsed: next };
        }),

      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      setRightPanelWidth: (rightPanelWidth) => {
        if (typeof window !== "undefined") {
          window.localStorage?.setItem("klecx-panel-width", String(rightPanelWidth));
        }
        set({ rightPanelWidth });
      },
      toggleRightPanelOpen: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      setComposerEnterToSend: (composerEnterToSend) =>
        set({ composerEnterToSend }),
      setOnboardingDismissed: (onboardingDismissed) =>
        set({ onboardingDismissed }),
      setDraft: (workspaceId, text) =>
        set((state) => ({
          drafts: { ...state.drafts, [workspaceId]: text },
        })),
      clearDraft: (workspaceId) =>
        set((state) => {
          const next = { ...state.drafts };
          delete next[workspaceId];
          return { drafts: next };
        }),
      clearAllDrafts: () => set({ drafts: {} }),

      toggleMobileNavOpen: (mobileNavIsOpen) => set({ mobileNavIsOpen }),
      setCommandPaletteOpen: (commandPaletteOpen) =>
        set({ commandPaletteOpen }),
      toggleProfileDialogOpen: (profileDialogIsOpen) =>
        set({ profileDialogIsOpen }),
      setCodeTheme: (codeTheme) => set({ codeTheme }),
      setCurrentPageTitle: (currentPageTitle) => set({ currentPageTitle }),
      setCurrentPageId: (currentPageId) => set({ currentPageId }),
      setCurrentProject: ({ id, name }) =>
        set({ currentProjectId: id, currentProjectName: name }),
      setChatMode: (chatMode) => set({ chatMode }),
      setRightPanelFocus: (rightPanelFocus) => set({ rightPanelFocus }),
      resetTransientUi: () => set({ ...initialTransientState }),
    }),
    {
      name: "klecx-ui-store",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            },
      ),
      partialize: partializeUiState,
    },
  ),
);
