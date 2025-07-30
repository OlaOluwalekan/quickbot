import { PromptCalloutProps } from '@/types/chats.interface'
import { format } from 'date-fns'

const PromptCallout = ({ prompt, time }: PromptCalloutProps) => {
  const formattedTime = format(new Date(time), 'hh:mm a')

  return (
    <div className='w-full flex justify-end'>
      <div className='text-sm  w-[90%] max-w-[400px]'>
        <article className='bg-purple text-white-main px-2 py-2.5 rounded-lg rounded-br-none'>
          <p>{prompt}</p>
        </article>
        <article className='text-xs flex gap-1 text-medium-grey justify-end'>
          <span>You</span>
          <span>{formattedTime}</span>
        </article>
      </div>
    </div>
  )
}

export default PromptCallout
