import LinkButton from '../ui/button/LinkButton'
import { FaChevronRight } from 'react-icons/fa6'
import PromptCallout from './PromptCallout'
import ResponseCallout from './ResponseCallout'
import { homeSamplePrompts } from '@/data/samplePrompts'

const Hero = () => {
  const { prompt, character, responses } = homeSamplePrompts

  return (
    <div className='w-full'>
      <div className='flex flex-col justify-center items-center gap-4 laptop:flex-row laptop:gap-8 w-[90%] max-w-[1200px] mx-auto py-10'>
        <div className='flex flex-col gap-2 justify-center items-center laptop:items-start laptop:gap-6'>
          <h3 className='text-3xl font-semibold'>Chat Smarter, Not Harder</h3>
          <p className='text-base text-center laptop:text-start'>
            Your personal AI assistant that learns and grows with you. Get fast,
            context-aware answers to any question—whether you need a quick fact,
            a deep explanation, or creative ideas at your fingertips.
          </p>

          <section className='mt-2 flex flex-col base:flex-row'>
            <LinkButton
              href='/auth/register'
              text='Try Airacter for Free'
              theme='primary'
              className='bg-lemon text-white-main text-nowrap'
            />
            <LinkButton
              href='#'
              children={
                <article className='flex items-center'>
                  <span>See Examples</span> <FaChevronRight />
                </article>
              }
              theme='primary'
            />
          </section>
        </div>

        {/* Hero Image */}
        <div className='w-full py-4 border-[1px] border-light-grey dark:border-light-grey/30 shadow-xl dark:shadow-gray-900 rounded-2xl dark:bg-eerie-black flex flex-col h-[300px] overflow-hidden text-sm'>
          <div className='px-4 h-full overflow-auto scrollbar-none hover:scrollbar-thin flex flex-col gap-3'>
            <PromptCallout prompt={prompt} time={new Date()} />

            {responses.map((res, index) => {
              return (
                <ResponseCallout
                  key={index}
                  response={res}
                  character={character}
                  time={new Date()}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
