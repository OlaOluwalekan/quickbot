import Feature from './Feature'
import { features } from '@/data/features'

const Features = () => {
  return (
    <div className='w-full bg-whitish dark:bg-eerie-black py-20 overflow-x-auto'>
      <div className='flex flex-col gap-4 justify-center items-center tablet:items-stretch tablet:justify-start laptop:justify-center tablet:flex-row w-[90%] max-w-[1200px] mx-auto'>
        {features.map((feature) => (
          <Feature
            key={feature.id}
            Icon={feature.Icon}
            title={feature.title}
            text={feature.text}
          />
        ))}
      </div>
    </div>
  )
}

export default Features
