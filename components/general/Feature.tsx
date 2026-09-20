import { ReactNode } from 'react'

const Feature = ({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) => {
  return (
    <div className='flex flex-col items-start gap-4 p-8 rounded-2xl bg-base-100 border border-base-200/50 shadow-sm hover:shadow-md transition-all hover:border-primary/30 dark:bg-dark-base-200/30 dark:border-dark-base-200 dark:hover:border-primary/50 group'>
      <div className='w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-content transition-all duration-300'>
        {icon}
      </div>
      <h3 className='text-xl font-bold text-base-content dark:text-dark-base-content mt-2'>
        {title}
      </h3>
      <p className='text-base text-base-content/70 dark:text-dark-base-content/70 leading-relaxed'>
        {text}
      </p>
    </div>
  )
}

export default Feature
