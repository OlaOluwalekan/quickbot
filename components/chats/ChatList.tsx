'use client'

import { ChatProps } from '@/types/chats.interface'
import Chat from './Chat'
import { formatCustomDate } from '@/utils/format'

const ChatList = ({
  chats,
  dates,
  grouped,
}: {
  chats: ChatProps[]
  dates: string[]
  grouped: Record<string, ChatProps[]>
}) => {
  return (
    <div className='flex flex-col gap-1 flex-grow overflow-auto scrollbar-thin scrollbar-thumb-sky-700 scrollbar-track-sky-300 scrollbar-track-rounded-full scrollbar-thumb-rounded-full'>
      {chats.length === 0 ? (
        <div className='w-full h-full flex justify-center items-center text-center px-3 text-primary-content'>
          No chat yet. Use the input field to ask Quick anything
        </div>
      ) : (
        dates.map((date) => {
          return (
            <div key={date}>
              <div className='text-primary-content text-xs px-2'>
                <article className='bg-base-100/30 text-base-content w-fit mb-1 px-2 py-0.5 rounded'>
                  {formatCustomDate(date)}
                </article>
              </div>
              {grouped[date].map((chat) => (
                <Chat key={chat.id} chat={chat} />
              ))}
            </div>
          )
        })
        // chats.map((chat) => {
        //   return <Chat key={chat.id} chat={chat} />
        // })
      )}
    </div>
  )
}

export default ChatList
