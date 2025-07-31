import { BasicBtnProps } from '@/types'
import clsx from 'clsx'
import { sizeClass, themeClass } from './button.config'

/**
 * Basic button
 * @param {Object} props - component properties
 * @param {string} props.type - button type either submit, button or reset
 * @param {string} props.text - text of the button
 * @param {string} props.size - button size either small, medium, large or full
 * @param {boolean} props.disabled - whether the button is disabled or not
 * @param {string} props.theme - the button theme either primary, outline or base
 * @param {string} props.title - the title of the button for tool tip
 * @returns {JSX.Element} styled button component
 */
const BasicButton = ({
  type,
  text,
  disabled,
  className,
  title,
}: BasicBtnProps): JSX.Element => {
  const defaultClass = 'w-full py-2 px-4 rounded text-center'

  return (
    <button
      type={type}
      className={clsx(
        defaultClass,
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer opacity-100',
        'rounded',
        className
      )}
      title={title}
    >
      {text}
    </button>
  )
}

export default BasicButton
