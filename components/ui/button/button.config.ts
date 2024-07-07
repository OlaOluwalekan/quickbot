import clsx from 'clsx'

export const sizeClass = (size: string) =>
  clsx({
    'w-[100px]': size === 'small',
    'w-[150px]': size === 'medium',
    'w-[300px]': size === 'large',
    'w-full': size === 'full',
  })

export const themeClass = (theme: 'primary' | 'outline' | 'base') =>
  clsx({
    'bg-primary text-primary-content hover:bg-accent hover:text-accent-content':
      theme === 'primary',
    'border-2 border-primary text-primary hover:bg-primary hover:text-primary-content':
      theme === 'outline',
    'border-2 border-base-200 bg-base-100 text-base-content hover:bg-base-200':
      theme === 'base',
  })
