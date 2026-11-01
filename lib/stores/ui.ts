import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatProps, ResponseProps } from "@/types/chats";

export interface PersistedUiSlice {
  sidebarCollapsed: boolean;
  rightPanelOpen: boolean;
  composerEnterToSend: boolean;
  drafts: Record<string, string>;
}

export interface UiState extends PersistedUiSlice {
  // Persisted actions
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleRightPanelOpen: () => void;
  setComposerEnterToSend: (enterToSend: boolean) => void;
  setDraft: (workspaceId: string, text: string) => void;
  clearDraft: (workspaceId: string) => void;
  clearAllDrafts: () => void;

  // Transient UI state (never persisted to localStorage)
  mobileNavIsOpen: boolean;
  profileDialogIsOpen: boolean;
  codeTheme: "light" | "dark";
  currentPageTitle: string;
  currentPageId: string | null;
  chatMenuIsOpen: boolean;
  chatMenuClass: string;
  dialogData: ChatProps | null;
  editPopUpIsOpen: boolean;
  deletePopUpIsOpen: boolean;
  chatInputHeight: string;
  searchResultIsOpen: boolean;
  chatMode: "text" | "image";
  optimisticResponses: ResponseProps[];

  // Transient actions
  toggleMobileNavOpen: (open: boolean) => void;
  toggleProfileDialogOpen: (open: boolean) => void;
  setCodeTheme: (theme: "light" | "dark") => void;
  setCurrentPageTitle: (title: string) => void;
  setCurrentPageId: (id: string | null) => void;
  toggleChatMenuOpen: (open: boolean) => void;
  setChatMenuClass: (cls: string) => void;
  setDialogData: (data: ChatProps | null) => void;
  setEditPopUpOpen: (open: boolean) => void;
  setDeletePopUpOpen: (open: boolean) => void;
  setChatInputHeight: (height: string) => void;
  setSearchResultIsOpen: (open: boolean) => void;
  setChatMode: (mode: "text" | "image") => void;
  addOptimisticResponse: (response: ResponseProps) => void;
  clearOptimisticResponses: () => void;
  resetTransientUi: () => void;
}

const initialTransientState = {
  mobileNavIsOpen: false,
  profileDialogIsOpen: false,
  codeTheme: "light" as const,
  currentPageTitle: "New Chat",
  currentPageId: null as string | null,
  chatMenuIsOpen: false,
  chatMenuClass: "",
  dialogData: null as ChatProps | null,
  editPopUpIsOpen: false,
  deletePopUpIsOpen: false,
  chatInputHeight: "56px",
  searchResultIsOpen: false,
  chatMode: "text" as const,
  optimisticResponses: [] as ResponseProps[],
};

export function partializeUiState(state: UiState): PersistedUiSlice {
  return {
    sidebarCollapsed: state.sidebarCollapsed,
    rightPanelOpen: state.rightPanelOpen,
    composerEnterToSend: state.composerEnterToSend,
    drafts: state.drafts,
  };
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      rightPanelOpen: false,
      composerEnterToSend: true,
      drafts: {},

      ...initialTransientState,

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
      toggleRightPanelOpen: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      setComposerEnterToSend: (composerEnterToSend) =>
        set({ composerEnterToSend }),
      setDraft: (workspaceId, text) =>
        set((state) => {
          const next = { ...state.drafts };
          if (!text) {
            delete next[workspaceId];
          } else {
            next[workspaceId] = text;
          }
          return { drafts: next };
        }),
      clearDraft: (workspaceId) =>
        set((state) => {
          const next = { ...state.drafts };
          delete next[workspaceId];
          return { drafts: next };
        }),
      clearAllDrafts: () => set({ drafts: {} }),

      toggleMobileNavOpen: (mobileNavIsOpen) => set({ mobileNavIsOpen }),
      toggleProfileDialogOpen: (profileDialogIsOpen) =>
        set({ profileDialogIsOpen }),
      setCodeTheme: (codeTheme) => set({ codeTheme }),
      setCurrentPageTitle: (currentPageTitle) => set({ currentPageTitle }),
      setCurrentPageId: (currentPageId) => set({ currentPageId }),
      toggleChatMenuOpen: (chatMenuIsOpen) => set({ chatMenuIsOpen }),
      setChatMenuClass: (chatMenuClass) => set({ chatMenuClass }),
      setDialogData: (dialogData) => set({ dialogData }),
      setEditPopUpOpen: (editPopUpIsOpen) => set({ editPopUpIsOpen }),
      setDeletePopUpOpen: (deletePopUpIsOpen) => set({ deletePopUpIsOpen }),
      setChatInputHeight: (chatInputHeight) => set({ chatInputHeight }),
      setSearchResultIsOpen: (searchResultIsOpen) =>
        set({ searchResultIsOpen }),
      setChatMode: (chatMode) => set({ chatMode }),
      addOptimisticResponse: (response) =>
        set((state) => {
          if (state.optimisticResponses.some((r) => r.id === response.id)) {
            return state;
          }
          return {
            optimisticResponses: [...state.optimisticResponses, response],
          };
        }),
      clearOptimisticResponses: () => set({ optimisticResponses: [] }),
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
            }
      ),
      partialize: partializeUiState,
    }
  )
);
