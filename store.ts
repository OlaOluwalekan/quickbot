"use client";

import { configureStore } from "@reduxjs/toolkit";
import generalSlice from "./features/generalSlice";

const store = configureStore({
  reducer: {
    general: generalSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          "general/setDialogData",
          "general/addOptimisticResponse",
        ],
        ignoredPaths: [
          "general.dialogData.createdAt",
          "general.dialogData.updatedAt",
          "general.optimisticResponses",
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;

export default store;
