import { InputWithIconsProps } from '@/types/input-types'
import clsx from 'clsx'

/**
 * typical input with icon
 * @param {Object} props - The component properties
 * @param {string} props.type - input type e.g. email, password, text, etc
 * @param {string} props.placeholder - input placeholder
 * @param {ReactNode} props.icon - input icon - React component
 * @param {string} props.name - input name used mainly for server action and onChange handler
 * @param {string} props.id - input id
 * @param {string | number} props.value - input value
 * @param {ReactEventHandler} props.onChange - callback on change event handler
 * @param {boolean} props.readonly - whether input is read-only or not
 * @returns {JSX.Element} styled input with icon
 */
const InputWithIcon = ({
  type,
  placeholder,
  icons,
  name,
  id,
  value,
  onChange,
  readonly = false,
}: InputWithIconsProps): JSX.Element => {
  return (
    <label
      className={clsx(
        'px-3 border-dove-grey dark:border-medium-grey border-[1px] py-2.5 rounded-md flex items-center gap-2 focus-within:border-2',
        type === 'hidden' && 'hidden',
        readonly && 'cursor-not-allowed'
      )}
    >
      {/* icon */}
      <span
        className={clsx(
          readonly
            ? 'text-medium-grey opacity-50'
            : 'text-teal-green opacity-100'
        )}
      >
        {icons}
      </span>

      {/* input */}
      <input
        type={type}
        className={clsx(
          'grow focus:outline-none',
          readonly && 'opacity-50 text-medium-grey'
        )}
        placeholder={placeholder}
        name={name}
        id={id}
        value={value}
        onChange={onChange}
        readOnly={readonly}
      />
    </label>
  )
}

export default InputWithIcon
