import { MouseEvent, ReactNode } from 'react'

interface ButtonBase {
  type?: 'submit' | 'button' | 'reset'
  text?: string
  theme?: 'primary' | 'outline' | 'base'
  className?: string
  disabled?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  title?: string
  children?: ReactNode
}

export interface BasicBtnProps extends ButtonBase {
  size?: 'small' | 'medium' | 'large' | 'full'
}

export interface LinkBtnProps extends BasicBtnProps {
  href: string
}

export interface OAuthBtnProps extends ButtonBase {
  icon: JSX.Element
  text: string
}
