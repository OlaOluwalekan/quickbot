'use client'

import { configureStore } from '@reduxjs/toolkit'
import generalSlice from './features/generalSlice'

const store = configureStore({
  reducer: {
    general: generalSlice,
  },
})

export type RootState = ReturnType<typeof store.getState>

export default store
