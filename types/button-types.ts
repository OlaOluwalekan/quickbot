interface ButtonBase {
  type?: 'submit' | 'button' | 'reset'
  text?: string
  theme: 'primary' | 'outline' | 'base'
  disabled?: boolean
}

export interface BasicBtnProps extends ButtonBase {
  size: 'small' | 'medium' | 'large' | 'full'
}

export interface LinkBtnProps extends BasicBtnProps {
  href: string
}
