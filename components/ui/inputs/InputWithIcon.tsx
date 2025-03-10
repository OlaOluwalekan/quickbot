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
  readonly,
}: InputWithIconsProps): JSX.Element => {
  return (
    <label
      className={clsx(
        'input input-bordered flex items-center gap-2 my-2',
        type === 'hidden' && 'hidden'
      )}
    >
      {/* icon */}
      <span
        className={clsx(
          'input-icon',
          readonly ? 'text-gray-500 opacity-50' : 'text-primary opacity-100'
        )}
      >
        {icons}
      </span>

      {/* input */}
      <input
        type={type}
        className={clsx('grow', readonly && 'opacity-50 text-gray-500')}
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
