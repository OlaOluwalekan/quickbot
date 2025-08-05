import { ResponseProps } from '@/types/chats.interface'
import { format } from 'date-fns'
import { FaRobot } from 'react-icons/fa6'
import ResponseMD from './markdown/ResponseMD'
import { appName } from '@/data/app'
import ResponseActions from './ResponseActions'

const BotResponseCallout = ({ response }: { response: ResponseProps }) => {
  return (
    <div className='w-full float-start'>
      <div className='w-full max-w-[700px] flex gap-2'>
        <section className='w-[calc(100%-40px)]'>
          <div className='whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm overflow-hidden w-full'>
            <ResponseMD response={response.response} />
          </div>

          <section>
            <ResponseActions response={response} />

            <div className='flex gap-2 items-center text-xs px-2'>
              <span>{appName}</span>
              <time className='text-xs opacity-50 ml-2'>
                {format(response.createdAt, 'MMM dd, yyyy HH:mm a')}
              </time>
            </div>
          </section>
        </section>

        {/* <div className=''>
          <div className='w-10 small:w-7 rounded-full flex justify-center items-center'>
            <FaRobot className='text-4xl small:text-2xl' />
          </div>
        </div> */}
      </div>
    </div>
  )
}

export default BotResponseCallout
