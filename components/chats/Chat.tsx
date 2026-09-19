'use client'

import {
  setChatMenuClass,
  setDialogData,
  toggleChatMenuOpen,
  toggleMobileNavOpen,
} from '@/features/generalSlice'
import { RootState } from '@/store'
import { ChatProps } from '@/types/chats.interface'
import clsx from 'clsx'
import Link from 'next/link'
import { MouseEvent } from 'react'
import { FaEllipsisV } from 'react-icons/fa'
import { useDispatch, useSelector } from 'react-redux'

const Chat = ({ chat }: { chat: ChatProps }) => {
  const dispatch = useDispatch()
  const { currentPageId, chatMenuIsOpen, chatMenuClass, dialogData } =
    useSelector((store: RootState) => store.general)

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (
      e.currentTarget.className.includes(`a-modal`) &&
      dialogData?.id !== chat.id
    ) {
      dispatch(toggleChatMenuOpen(true))
    } else {
      dispatch(toggleChatMenuOpen(!chatMenuIsOpen))
    }
    dispatch(setDialogData(chat))
    const target = e.currentTarget.getBoundingClientRect()
    dispatch(setChatMenuClass(`${target.top - 50}px`))
  }

  return (
    <div className='w-full'>
      <div
        className={clsx(
          'w-full flex items-center gap-2 px-2 rounded-lg hover:bg-orange/20 py-2',
          currentPageId === chat.id
            ? 'border-l-lemon border-l-4 bg-teal-green/20'
            : ''
        )}
      >
        <Link
          href={`/chat/c/${chat.id}`}
          className='w-[90%] flex flex-col gap-1'
          onClick={() => dispatch(toggleMobileNavOpen(false))}
        >
          <p className='text-nowrap overflow-x-scroll scrollbar-none text-sm'>
            {chat.title}
          </p>
          <article className='text-[10px] flex gap-0.5'>
            {['1', '2', '3'].map((no) => {
              return (
                <span
                  key={no}
                  className='flex px-2 py-0 rounded-sm text-teal-green border-[1px] border-lemon'
                >
                  tag {no}
                </span>
              )
            })}
          </article>
        </Link>
        <button onClick={handleClick} className={clsx('a-modal', chat.id)}>
          <FaEllipsisV />
        </button>
      </div>
    </div>
  )
}

export default Chat
