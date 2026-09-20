import clsx from 'clsx'

export const sizeClass = (size: string) =>
  clsx({
    'w-auto min-w-[100px] px-4': size === 'small',
    'w-auto min-w-[150px] px-6': size === 'medium',
    'w-auto min-w-[200px] px-8': size === 'large',
    'w-full px-6': size === 'full',
  })

export const themeClass = (theme: 'primary' | 'outline' | 'base') =>
  clsx({
    'bg-primary border-primary border-2 text-primary-content hover:bg-accent hover:border-accent hover:text-accent-content rounded-full transition-all duration-200':
      theme === 'primary',
    'border-2 border-primary bg-transparent text-primary hover:bg-primary/10 rounded-full transition-all duration-200':
      theme === 'outline',
    'border-2 border-base-200 bg-base-100 text-base-content hover:bg-base-200 rounded-full transition-all duration-200':
      theme === 'base',
  })
