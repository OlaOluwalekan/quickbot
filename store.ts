"use client";

import { configureStore } from "@reduxjs/toolkit";
import generalSlice from "./features/generalSlice";

const store = configureStore({
  reducer: {
    general: generalSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;

export default store;
