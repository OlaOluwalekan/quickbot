import Feature from './Feature'
import { features } from '@/data/features'

const Features = () => {
  return (
    <div className='w-full bg-whitish dark:bg-eerie-black py-20 flex flex-col gap-5'>
      <div className='flex flex-col gap-3 w-[90%] max-w-[700px] mx-auto'>
        <h3 className='text-3xl text-center' id='features'>
          Key Features
        </h3>
        <p className='text-lg text-center text-dark-grey/80 dark:text-dove-grey/80'>
          Experience the future of AI assistance with our intuitive and powerful
          features designed to make your life easier.
        </p>
      </div>

      <div className='overflow-x-auto'>
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
    </div>
  )
}

export default Features
