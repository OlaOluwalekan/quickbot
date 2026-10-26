import { GeneralSliceInit } from "@/types";
import { ChatProps, ResponseProps } from "@/types/chats";
import { ThemeProps } from "@/types/theme.interface";
import { addToLocalStorage, getFromLocalStorage } from "@/utils/local-storage";
import { createSlice } from "@reduxjs/toolkit";

const initialState: GeneralSliceInit = {
  theme: (getFromLocalStorage("theme") as ThemeProps) || "light",
  themeIsOpen: false,
  mobileNavIsOpen: false,
  profileDialogIsOpen: false,
  aiResponse: "",
  loadingResponse: false,
  codeTheme: "light",
  currentPageTitle: "New Chat",
  currentPageId: null,
  chatMenuIsOpen: false,
  chatMenuClass: "",
  dialogData: null,
  editPopUpIsOpen: false,
  deletePopUpIsOpen: false,
  chatInputHeight: "56px",
  searchResultIsOpen: false,
  streamingPrompt: "",
  streamingText: "",
  isStreaming: false,
  chatMode: "text",
  optimisticResponses: [],
};

const generalSlice = createSlice({
  initialState,
  name: "general",
  reducers: {
    changeTheme: (state, { payload }: { payload: ThemeProps }) => {
      state.theme = payload;
      addToLocalStorage("theme", payload);
    },
    toggleThemeOpen: (state, { payload }: { payload: boolean }) => {
      state.themeIsOpen = payload;
    },
    toggleMobileNavOpen: (state, { payload }: { payload: boolean }) => {
      state.mobileNavIsOpen = payload;
    },
    toggleProfileDialogOpen: (state, { payload }: { payload: boolean }) => {
      state.profileDialogIsOpen = payload;
    },
    setAIResponse: (state, { payload }: { payload: string }) => {
      state.aiResponse = payload;
    },
    setLoadingResponse: (state, { payload }: { payload: boolean }) => {
      state.loadingResponse = payload;
    },
    setCodeTheme: (state, { payload }: { payload: "dark" | "light" }) => {
      state.codeTheme = payload;
    },
    setCurrentPageTitle: (state, { payload }: { payload: string }) => {
      state.currentPageTitle = payload;
    },
    setCurrentPageId: (state, { payload }: { payload: string | null }) => {
      state.currentPageId = payload;
    },
    toggleChatMenuOpen: (state, { payload }: { payload: boolean }) => {
      state.chatMenuIsOpen = payload;
    },
    setChatMenuClass: (state, { payload }: { payload: string }) => {
      state.chatMenuClass = payload;
    },
    setDialogData: (state, { payload }: { payload: ChatProps | null }) => {
      if (!payload) {
        state.dialogData = null;
        return;
      }
      state.dialogData = {
        ...payload,
        createdAt:
          payload.createdAt instanceof Date
            ? payload.createdAt.toISOString()
            : String(payload.createdAt),
        updatedAt:
          payload.updatedAt instanceof Date
            ? payload.updatedAt.toISOString()
            : String(payload.updatedAt),
      };
    },
    setEditPopUpOpen: (state, { payload }: { payload: boolean }) => {
      state.editPopUpIsOpen = payload;
    },
    setDeletePopUpOpen: (state, { payload }: { payload: boolean }) => {
      state.deletePopUpIsOpen = payload;
    },
    setChatInputHeight: (state, { payload }: { payload: string }) => {
      state.chatInputHeight = payload;
    },
    setSearchResultIsOpen: (state, { payload }: { payload: boolean }) => {
      state.searchResultIsOpen = payload;
    },
    setStreamingPrompt: (state, { payload }: { payload: string }) => {
      state.streamingPrompt = payload;
    },
    setStreamingText: (state, { payload }: { payload: string }) => {
      state.streamingText = payload;
    },
    appendStreamingText: (state, { payload }: { payload: string }) => {
      state.streamingText += payload;
    },
    setIsStreaming: (state, { payload }: { payload: boolean }) => {
      state.isStreaming = payload;
    },
    setChatMode: (state, { payload }: { payload: "text" | "image" }) => {
      state.chatMode = payload;
    },
    addOptimisticResponse: (
      state,
      { payload }: { payload: ResponseProps }
    ) => {
      const exists = state.optimisticResponses.some((r) => r.id === payload.id);
      if (!exists) {
        state.optimisticResponses.push({
          ...payload,
          createdAt:
            payload.createdAt instanceof Date
              ? payload.createdAt.toISOString()
              : String(payload.createdAt),
        });
      }
    },
    clearOptimisticResponses: (state) => {
      state.optimisticResponses = [];
    },
    resetStreamingState: (state) => {
      state.streamingPrompt = "";
      state.streamingText = "";
      state.isStreaming = false;
      state.loadingResponse = false;
    },
  },
});

export const {
  changeTheme,
  toggleThemeOpen,
  toggleMobileNavOpen,
  toggleProfileDialogOpen,
  setAIResponse,
  setLoadingResponse,
  setCodeTheme,
  setCurrentPageTitle,
  setCurrentPageId,
  toggleChatMenuOpen,
  setChatMenuClass,
  setDialogData,
  setEditPopUpOpen,
  setDeletePopUpOpen,
  setChatInputHeight,
  setSearchResultIsOpen,
  setStreamingPrompt,
  setStreamingText,
  appendStreamingText,
  setIsStreaming,
  setChatMode,
  addOptimisticResponse,
  clearOptimisticResponses,
  resetStreamingState,
} = generalSlice.actions;

export default generalSlice.reducer;
