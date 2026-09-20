import { LinkBtnProps } from '@/types'
import clsx from 'clsx'
import Link from 'next/link'
import { sizeClass, themeClass } from './button.config'

const LinkButton = ({ size, text, theme, href }: LinkBtnProps) => {
  return (
    <Link
      href={href}
      className={clsx(
        sizeClass(size),
        themeClass(theme as 'base' | 'primary' | 'outline'),
        'inline-flex items-center justify-center font-medium transition-colors py-2 text-center cursor-pointer'
      )}
    >
      {text}
    </Link>
  )
}

export default LinkButton
