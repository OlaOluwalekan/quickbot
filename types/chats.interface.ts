import { ReactNode } from 'react'

export interface ChatProps {
  id: string
  title: string
  createdBy: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ResponseProps {
  id: string
  chatId: string
  question: string
  response: string
  createdAt: Date | string
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
