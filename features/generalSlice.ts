import { GeneralSliceInit } from "@/types";
import { ChatProps } from "@/types/chats";
import { addToLocalStorage, getFromLocalStorage } from "@/utils/local-storage";
import { createSlice } from "@reduxjs/toolkit";

const initialState: GeneralSliceInit = {
  theme:
    (getFromLocalStorage("theme") as
      | "cupcake"
      | "dracula"
      | "light"
      | "black") || "light",
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
};

const generalSlice = createSlice({
  initialState,
  name: "general",
  reducers: {
    changeTheme: (state, { payload }) => {
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
      state.dialogData = payload;
    },
    setEditPopUpOpen: (state, { payload }: { payload: boolean }) => {
      state.editPopUpIsOpen = payload;
    },
    setDeletePopUpOpen: (state, { payload }: { payload: boolean }) => {
      state.deletePopUpIsOpen = payload;
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
} = generalSlice.actions;

export default generalSlice.reducer;
