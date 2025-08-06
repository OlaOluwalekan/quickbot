import { RadioInputProps } from '@/types/input-types'
import clsx from 'clsx'

const RadioInput = ({
  name,
  id,
  label,
  isChecked,
  value,
  onChange,
}: RadioInputProps) => {
  return (
    <section>
      <input
        type='radio'
        name={name}
        id={id}
        value={value}
        onChange={onChange}
        checked={isChecked}
        className='peer hidden'
      />

      <label
        htmlFor={id}
        className='flex items-center gap-2 cursor-pointer text-sm'
      >
        <div
          className={clsx(
            'w-4 aspect-square rounded-full border-[1px] flex justify-center items-center',
            isChecked
              ? 'bg-lemon border-lemon'
              : 'bg-white-main dark:bg-black-main border-medium-grey/50'
          )}
        >
          <article
            className={clsx(
              'w-2 aspect-square rounded-full',
              isChecked ? 'bg-white-main dark:bg-black-main' : ''
            )}
          ></article>
        </div>
        <span>{label}</span>
      </label>
    </section>
  )
}

export default RadioInput
