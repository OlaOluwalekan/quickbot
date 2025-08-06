'use client'

import { setAuthUserId, setCurrentChatId } from '@/features/generalSlice'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'

const ChatClient = ({ chatId, userId }: { chatId: string; userId: string }) => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(setCurrentChatId(chatId))
    dispatch(setAuthUserId(userId))
  }, [])

  return null
}

export default ChatClient
