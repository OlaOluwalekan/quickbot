'use client'

import {
  setAIResponse,
  setChatInputHeight,
  setLoadingResponse,
} from '@/features/generalSlice'
import { RootState } from '@/store'
import { getResponseFromAI } from '@/utils/actions/response'
import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useEffect, useRef, useState, useTransition } from 'react'
import { RxPaperPlane } from 'react-icons/rx'
import { ImAttachment } from 'react-icons/im'
import { AiOutlineFileImage } from 'react-icons/ai'
import { HiOutlineEmojiHappy } from 'react-icons/hi'
import { useDispatch, useSelector } from 'react-redux'

const ChatInput = ({
  userId,
  existingToken,
}: {
  userId: string
  existingToken: number
}) => {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const dispatch = useDispatch()
  const [text, setText] = useState('')
  const { currentPageTitle } = useSelector((store: RootState) => store.general)

  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = '48px'
    }
  }, [])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    if (textRef.current) {
      textRef.current.style.height = '48px'
      textRef.current.style.height = `${textRef.current.scrollHeight}px`
      if (textRef.current.scrollHeight > 48) {
        textRef.current.style.lineHeight = '20px'
      }

      let numHeight = parseInt(textRef.current.style.height)
      dispatch(
        setChatInputHeight(
          numHeight < 184 ? textRef.current.style.height : '195px'
        )
      )
    }
  }

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      dispatch(setLoadingResponse(true))
      getResponseFromAI(formData, window.location.pathname, existingToken).then(
        (res) => {
          if (res.success) {
            dispatch(setAIResponse(res.data.text))
            if (textRef.current) {
              textRef.current.value = ''
              textRef.current.style.height = '48px'
            }
          }
          if (res?.data.chatId && window.location.pathname === '/chat') {
            router.push(`/chat/${res.data.chatId}`)
          }
          dispatch(setLoadingResponse(false))
        }
      )
    })
  }

  return (
    <form
      className={clsx(
        'w-[90%] max-w-[700px] my-3 absolute bottom-0 left-0 right-0 mx-auto rounded-md overflow-hidden flex flex-col gap-1',
        currentPageTitle === '' && 'hidden'
      )}
      action={handleSubmit}
    >
      <div>
        <input type='hidden' value={userId} id='id' name='id' />
        <textarea
          onChange={handleChange}
          ref={textRef}
          name='question'
          id='question'
          rows={1}
          placeholder='Ask Anything...'
          className='w-full resize-none h-[48px] max-h-[100px] overflow-y-auto text-base py-3 pl-3 pr-8 rounded-lg bg-platinum dark:bg-eerie-black placeholder:text-medium-grey scrollbar-thin focus:outline-none scrollbar-track-teal-green/10 scrollbar-thumb-teal-green/20'
          defaultValue={text}
        ></textarea>
      </div>

      <div className='flex justify-between items-center'>
        <section className='flex gap-1'>
          <button className='px-1.5 aspect-square hover:bg-teal-green/35 hover:text-teal-green rounded-full cursor-pointer'>
            <ImAttachment className='rotate-[-180deg]' />
          </button>

          <button className='px-1.5 aspect-square hover:bg-teal-green/35 hover:text-teal-green rounded-full cursor-pointer'>
            <AiOutlineFileImage />
          </button>

          <button className='px-1.5 aspect-square hover:bg-teal-green/35 hover:text-teal-green rounded-full cursor-pointer'>
            <HiOutlineEmojiHappy />
          </button>
        </section>

        <section>
          <button
            type='submit'
            className={clsx(
              'flex gap-2 items-center rounded px-4 py-1 text-white-main',
              isPending || text.trim() === ''
                ? 'bg-medium-grey cursor-not-allowed opacity-15'
                : 'bg-lemon hover:bg-teal-green cursor-pointer opacity-100'
            )}
            disabled={isPending || text.trim() === ''}
          >
            <RxPaperPlane />
            Send
          </button>
        </section>
      </div>
    </form>
  )
}

export default ChatInput
