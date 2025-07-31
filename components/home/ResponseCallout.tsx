import { ResponseCalloutProps } from '@/types/chats.interface'
import { format } from 'date-fns'
import ResponseMD from '../chats/markdown/ResponseMD'
import clsx from 'clsx'
import useWriter from '../../hooks/useWriter'

const ResponseCallout = ({
  response,
  time,
  character,
  className,
  animate = false,
}: ResponseCalloutProps) => {
  const formattedTime = format(new Date(time), 'hh:mm a')
  const animatedResponse = useWriter(response, 10)

  return (
    <div className={clsx('w-full flex justify-start', className)}>
      <div className='w-[90%] max-w-[400px]'>
        <article className='bg-teal-green text-white-main px-2 py-2.5 rounded-lg rounded-bl-none'>
          <ResponseMD response={animate ? animatedResponse : response} />
        </article>
        <article className='text-xs flex gap-1 text-medium-grey justify-start mt-1'>
          <span>{character}</span>
          <span>{formattedTime}</span>
        </article>
      </div>
    </div>
  )
}

export default ResponseCallout
