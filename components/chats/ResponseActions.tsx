'use client'

import { ResponseProps } from '@/types/chats.interface'
import { handleStop, readAloud } from '@/utils/speak'
import clsx from 'clsx'
import { marked } from 'marked'
import { useState } from 'react'
import { AiOutlineCopy } from 'react-icons/ai'
import { FaCopy, FaRegCircleStop } from 'react-icons/fa6'
import { HiMiniSpeakerWave } from 'react-icons/hi2'
import { IoMdCheckmarkCircleOutline } from 'react-icons/io'
import { IoShareSocialOutline } from 'react-icons/io5'
import { MdLibraryAddCheck } from 'react-icons/md'

const ResponseActions = ({ response }: { response: ResponseProps }) => {
  const [ResponseIsCopied, setResponseIsCopied] = useState(false)
  const [isReadingAloud, setIsReadingAloud] = useState(false)

  const handleCopyResponse = (text: string) => {
    navigator.clipboard.writeText(text)
    setResponseIsCopied(true)
    setTimeout(() => {
      setResponseIsCopied(false)
    }, 3000)
  }

  const parseMarkdownToText = (markdown: string) => {
    const html = marked(markdown)
    const doc = new DOMParser().parseFromString(html as string, 'text/html')
    return doc.body.textContent || ''
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
    <div className='opacity-50 text-sm mt-1 flex'>
      <button
        className={clsx(
          'hover:text-teal-green hover:bg-teal-green/30 px-1.5 aspect-square rounded-full cursor-pointer',
          ResponseIsCopied
            ? 'text-success'
            : 'text-base-content dark:text-dark-base-content'
        )}
        onClick={() => handleCopyResponse(response.response)}
      >
        {ResponseIsCopied ? <IoMdCheckmarkCircleOutline /> : <AiOutlineCopy />}
      </button>
      <button
        className={clsx(
          'hover:text-teal-green hover:bg-teal-green/30 px-1.5 aspect-square rounded-full cursor-pointer',
          isReadingAloud ? 'text-error' : ''
        )}
        onClick={handleReadClicked}
      >
        {isReadingAloud ? <FaRegCircleStop /> : <HiMiniSpeakerWave />}
      </button>
      <button
        className={clsx(
          'hover:text-teal-green hover:bg-teal-green/30 px-1.5 aspect-square rounded-full cursor-pointer'
        )}
      >
        <IoShareSocialOutline />
      </button>
    </div>
  )
}

export default ResponseActions
