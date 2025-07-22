'use client'

import { ResponseProps } from '@/types/chats'
import React, { useState } from 'react'
import UserImage from './UserImage'
import { format } from 'date-fns'
import { FaCopy, FaRegCircleStop, FaRobot } from 'react-icons/fa6'
import { HiMiniSpeakerWave } from 'react-icons/hi2'
import ResponseMD from './markdown/ResponseMD'
import clsx from 'clsx'
import { MdLibraryAddCheck } from 'react-icons/md'
import { handleStop, readAloud } from '@/utils/speak'
import { marked } from 'marked'

const Response = ({
  response,
  image,
}: {
  response: ResponseProps
  image: string | null
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const [ResponseIsCopied, setResponseIsCopied] = useState(false)
  const [isReadingAloud, setIsReadingAloud] = useState(false)

  const parseMarkdownToText = (markdown: string) => {
    const html = marked(markdown)
    const doc = new DOMParser().parseFromString(html as string, 'text/html')
    return doc.body.textContent || ''
  }

  const handleCopyQuestion = (text: string) => {
    navigator.clipboard.writeText(text)
    setIsCopied(true)
    setTimeout(() => {
      setIsCopied(false)
    }, 3000)
  }

  const handleCopyResponse = (text: string) => {
    navigator.clipboard.writeText(text)
    setResponseIsCopied(true)
    setTimeout(() => {
      setResponseIsCopied(false)
    }, 3000)
  }

  const handleReadClicked = () => {
    const text = parseMarkdownToText(response.response)

    if (isReadingAloud) {
      handleStop(setIsReadingAloud)
    } else {
      readAloud(text, setIsReadingAloud)
    }
  }

  return (
    <div id={response.id} className='flex flex-col gap-2 mb-4'>
      <div className='w-full flex justify-end'>
        <div className='float-end'>
          <div className='chat-header'>
            You
            <time className='text-xs opacity-50 ml-2'>
              {format(response.createdAt, 'MMM dd, yyyy HH:mm a')}
            </time>
          </div>

          <div className='flex flex-row-reverse gap-2 items-end'>
            <div className='chat-image avatar'>
              <UserImage image={image} />
            </div>

            <div className='bg-primary dark:bg-dark-primary text-primary-content dark:text-dark-primary-content py-3 px-2 rounded-lg whitespace-pre-wrap break-words'>
              {response.question}
            </div>
          </div>

          <div className='text-base-content dark:text-dark-base-content opacity-50 mt-1 text-base'>
            <button
              className={clsx(
                'hover:text-accent dark:hover:text-dark-accent cursor-pointer',
                isCopied
                  ? 'text-success'
                  : 'text-base-content dark:text-dark-base-content'
              )}
              onClick={() => handleCopyQuestion(response.question)}
            >
              {isCopied ? <MdLibraryAddCheck /> : <FaCopy />}
            </button>
          </div>
        </div>
      </div>

      <div className='small:w-full small:relative'>
        <div className='flex gap-2 items-center mb-1'>
          <div className='small:absolute small:bottom-[5px]'>
            <div className='w-10 small:w-7 rounded-full flex justify-center items-center'>
              <FaRobot className='text-4xl small:text-2xl' />
            </div>
          </div>
          <div className='flex flex-col'>
            Quickbot
            <time className='text-xs opacity-50 ml-2'>
              {format(response.createdAt, 'MMM dd, yyyy HH:mm a')}
            </time>
          </div>
        </div>

        <div className='markdown chat-bubble bg-base-100 dark:bg-dark-base-100 text-base-content dark:text-dark-base-content w-[90%] whitespace-pre-wrap break-words'>
          <ResponseMD response={response.response} />
        </div>

        <div className='opacity-50 border-t-2 border-primary/30 py-2 px-2 mt-2 text-base flex gap-2 small:ml-5'>
          <button
            className={clsx(
              'hover:text-accent dark:hover:text-dark-accent cursor-pointer',
              ResponseIsCopied
                ? 'text-success'
                : 'text-base-content dark:text-dark-base-content'
            )}
            onClick={() => handleCopyResponse(response.response)}
          >
            {ResponseIsCopied ? <MdLibraryAddCheck /> : <FaCopy />}
          </button>
          <button
            className={clsx(
              'hover:text-accent dark:hover:text-dark-accent cursor-pointer',
              isReadingAloud
                ? 'text-error'
                : 'text-base-content dark:text-dark-base-content'
            )}
            onClick={handleReadClicked}
          >
            {isReadingAloud ? <FaRegCircleStop /> : <HiMiniSpeakerWave />}
          </button>
        </div>
      </div>
      {/* <div className='divider my-2'></div> */}
    </div>
  )
}

export default Response
