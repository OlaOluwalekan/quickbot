import { ReactNode } from 'react'

export interface ChatProps {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
  isShared: boolean
  sharedWith: string[]
  roleId: string | null
  tags: string[]
}

export interface ResponseProps {
  id: string
  chatId: string
  isShared: boolean
  question: string
  response: string
  createdAt: Date | string
  sharedWith: string[]
  chat: {
    id: string
    title: string
  }
}

export interface PromptCalloutProps {
  prompt: string
  time: Date
  className?: string
}

export interface ResponseCalloutProps {
  response: string
  character: string
  time: Date
  className?: string
  animate?: boolean
}
