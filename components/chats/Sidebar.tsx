'use client'

import {
  toggleChatMenuOpen,
  toggleMobileNavOpen,
} from '@/features/generalSlice'
import { RootState } from '@/store'
import clsx from 'clsx'
import Link from 'next/link'
import { MouseEvent, useEffect } from 'react'
import { BiSolidMessageSquareAdd } from 'react-icons/bi'
import { FaBarsStaggered } from 'react-icons/fa6'
import { useDispatch, useSelector } from 'react-redux'
import ChatList from './ChatList'
import UserProfile from './user-profile/UserProfile'
import { ChatProps } from '@/types/chats.interface'
import ChatMenu from './ChatMenu'
import EditPopup from './EditPopup'
import DeletePopup from './DeletePopup'

const Sidebar = ({
  data,
  chats,
  dates,
}: {
  data: any
  chats: ChatProps[]
  dates: string[]
}) => {
  const {
    mobileNavIsOpen,
    chatMenuIsOpen,
    editPopUpIsOpen,
    deletePopUpIsOpen,
  } = useSelector((store: RootState) => store.general)
  const dispatch = useDispatch()

  const grouped: Record<string, ChatProps[]> = chats.reduce(
    (acc: Record<string, ChatProps[]>, chat) => {
      const dateKey = (
        chat.updatedAt instanceof Date
          ? chat.updatedAt
          : new Date(chat.updatedAt)
      )
        .toISOString()
        .split('T')[0]
      if (acc[dateKey] == null) {
        acc[dateKey] = []
      }
      acc[dateKey].push(chat)
      return acc
    },
    {}
  ) as Record<string, ChatProps[]>
  // const grouped: Record<string, ChatProps[]> = Object.groupBy(chats, (chat) => {
  //   return new Date(chat.updatedAt).toISOString().split('T')[0]
  // }) as Record<string, ChatProps[]>
  // console.log('GGG=>', grouped)

  useEffect(() => {
    if (!mobileNavIsOpen) {
      dispatch(toggleChatMenuOpen(false))
    }
  }, [mobileNavIsOpen])

  return (
    <div
      className={clsx(
        'w-screen h-screen bg-primary/50 fixed top-0 transition-all md:static md:w-[300px] z-10',
        mobileNavIsOpen ? 'left-0' : 'left-[-5000px]'
      )}
      onClick={() => dispatch(toggleMobileNavOpen(false))}
    >
      <div
        className='w-[300px] bg-primary h-full shadow-xl md:shadow-none small:w-full'
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        <section className='px-3 py-2 flex justify-between items-center'>
          <button
            className='text-primary-content text-lg cursor-pointer p-2 hover:bg-accent rounded-md md:hidden'
            onClick={() => dispatch(toggleMobileNavOpen(false))}
          >
            <FaBarsStaggered />
          </button>

          <Link
            href='/chat'
            className='flex gap-2 items-center text-primary-content hover:bg-accent p-2 rounded'
            onClick={() => dispatch(toggleMobileNavOpen(false))}
          >
            New Chat <BiSolidMessageSquareAdd />
          </Link>
        </section>
        <div className='w-full h-0.5 bg-secondary/30 dark:bg-dark-secondary/30'></div>
        <div className='h-[calc(100%-75px)] flex flex-col relative mt-1'>
          <ChatList chats={chats} dates={dates} grouped={grouped} />
          {chatMenuIsOpen && <ChatMenu />}
          {editPopUpIsOpen && <EditPopup />}
          {deletePopUpIsOpen && <DeletePopup />}
          <UserProfile data={data} />
        </div>
      </div>
    </div>
  )
}

export default Sidebar
