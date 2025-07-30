import LinkButton from '../ui/button/LinkButton'
import { FaChevronRight } from 'react-icons/fa6'
import PromptCallout from '../chats/PromptCallout'
import ResponseCallout from '../chats/ResponseCallout'

const Hero = () => {
  return (
    <div className='flex flex-col justify-center items-center gap-4 laptop:flex-row laptop:gap-8'>
      <div className='flex flex-col gap-2 justify-center items-center laptop:items-start laptop:gap-6'>
        <h3 className='text-3xl font-semibold'>Chat Smarter, Not Harder</h3>
        <p className='text-base text-center laptop:text-start'>
          Your personal AI assistant that learns and grows with you. Get fast,
          context-aware answers to any question—whether you need a quick fact, a
          deep explanation, or creative ideas at your fingertips.
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
      <div className='w-full py-4 border-[1px] border-light-grey dark:border-light-grey/30 shadow-2xl dark:shadow-gray-900 rounded-2xl dark:bg-eerie-black flex flex-col h-[300px] overflow-hidden'>
        <div className='px-4 h-full overflow-auto scrollbar-none hover:scrollbar-thin flex flex-col gap-3'>
          <PromptCallout
            prompt='Help me plan a weekend trip to the mountains'
            time={new Date()}
          />

          <ResponseCallout
            response='Sure! I can help you with that. What kind of activities are you interested in?'
            time={new Date()}
          />

          <ResponseCallout
            response={`Day 1: Hiking & scenic viewpoints
• Morning: Start with a moderate trail like Pine Ridge
• Afternoon: Lunch at Summit Café, then visit Eagle Point lookout
• Evening: Dinner at Mountain Lodge Restaurant

Day 2: Cabin relaxation & local activities
• Morning: Farmers market, then kayaking on Crystal Lake
• Afternoon: Local wine tasting or craft brewery tour
• Evening: Sunset picnic at Overlook Point`}
            time={new Date()}
          />
        </div>
      </div>
    </div>
  )
}

export default Hero
