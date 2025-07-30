import { ResponseCalloutProps } from '@/types/chats.interface'
import { format } from 'date-fns'

const ResponseCallout = ({ response, time }: ResponseCalloutProps) => {
  const formattedTime = format(new Date(time), 'hh:mm a')

  return (
    <div className='w-full flex justify-start'>
      <div className='text-sm w-[90%] max-w-[400px]'>
        <article className='bg-teal-green text-white-main px-2 py-2.5 rounded-lg rounded-bl-none'>
          <p>{response}</p>
        </article>
        <article className='text-xs flex gap-1 text-medium-grey justify-start'>
          <span>Trip Planner</span>
          <span>{formattedTime}</span>
        </article>
      </div>
    </div>
  )
}

export default ResponseCallout
