import { ReactEventHandler, ReactNode } from 'react'

export interface BasicInputProps {
  type?: string
  placeholder?: string
  readonly?: boolean
  name?: string
  id?: string
  value?: string
  label?: string
  onChange?: ReactEventHandler<HTMLInputElement>
}

export interface InputWithIconsProps extends BasicInputProps {
  icons: ReactNode
}

export interface RadioInputProps extends BasicInputProps {
  isChecked: boolean
}
