import { BasicBtnProps } from '@/types'
import clsx from 'clsx'
import { sizeClass, themeClass } from './button.config'

const BasicButton = ({ type, text, size, disabled, theme }: BasicBtnProps) => {
  return (
    <button
      type={type}
      className={clsx(
        sizeClass(size),
        themeClass(theme),
        disabled && 'cursor-not-allowed',
        'btn py-2 rounded'
      )}
    >
      {text}
    </button>
  )
}

export default BasicButton
