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
    <div className='flex flex-col justify-center items-center gap-2'>
      <span className='text-secondary text-2xl'>{icon}</span>
      <h3 className='text-base-content'>{title}</h3>
      <p className='text-base-content text-center text-sm opacity-75'>{text}</p>
    </div>
  )
}

export default Feature
