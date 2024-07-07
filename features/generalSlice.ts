import { GeneralSliceInit } from '@/types'
import { createSlice } from '@reduxjs/toolkit'

const initialState: GeneralSliceInit = {
  theme: 'light',
}

const generalSlice = createSlice({
  initialState,
  name: 'general',
  reducers: {},
})

export default generalSlice.reducer
