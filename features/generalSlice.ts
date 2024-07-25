import { GeneralSliceInit } from "@/types";
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
  },
});

export const { changeTheme, toggleThemeOpen } = generalSlice.actions;

export default generalSlice.reducer;
