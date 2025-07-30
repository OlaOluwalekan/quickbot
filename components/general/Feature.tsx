'use client'

import { ReactElement, useState } from 'react'

type FeatureProps = {
  Icon: (props: { animate: boolean }) => ReactElement
  title: string
  text: string
}

const Feature = ({ Icon, title, text }: FeatureProps) => {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className='flex flex-col justify-center items-center gap-4 bg-white-main dark:bg-black-main p-4 max-w-[300px] min-w-[250px] rounded-xl border-[1px] border-dove-grey dark:border-dove-grey/20 shadow-lg'
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon animate={hovered} />
      <h3 className='text-2xl font-semibold'>{title}</h3>
      <p className='text-center text-sm text-dark-grey/80 dark:text-platinum/70'>
        {text}
      </p>
    </div>
  )
}

export default Feature
