'use client'

import { ResponseProps } from '@/types/chats.interface'
import { format } from 'date-fns'
import UserImage from './UserImage'
import clsx from 'clsx'
import { useState } from 'react'
import { IoMdCheckmarkCircleOutline } from 'react-icons/io'
import { AiOutlineCopy } from 'react-icons/ai'

const UserPromptCallout = ({
  response,
  image,
}: {
  response: ResponseProps
  image: string | null
}) => {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopyQuestion = (text: string) => {
    navigator.clipboard.writeText(text)
    setIsCopied(true)
    setTimeout(() => {
      setIsCopied(false)
    }, 3000)
  }

  return (
    <div className='w-full flex justify-end'>
      <div className='float-end flex gap-2 max-w-[550px]'>
        <div className='chat-image avatar'>
          <UserImage image={image} />
        </div>

        <section>
          <div className='flex gap-2 items-end'>
            <div className='min-w-[200px] bg-purple dark:bg-purple-dark text-white-main py-3 px-3 rounded-lg whitespace-pre-wrap break-words'>
              {response.question}
            </div>
          </div>

          <section className='flex justify-between items-center'>
            <div className='text-xs'>
              You
              <time className='text-xs opacity-50 ml-2'>
                {format(response.createdAt, 'MMM dd, yyyy HH:mm a')}
              </time>
            </div>

            <div className='text-sm opacity-50'>
              <button
                className={clsx(
                  'cursor-pointer',
                  isCopied ? 'text-success' : ''
                )}
                onClick={() => handleCopyQuestion(response.question)}
              >
                {isCopied ? <IoMdCheckmarkCircleOutline /> : <AiOutlineCopy />}
              </button>
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}

export default UserPromptCallout
