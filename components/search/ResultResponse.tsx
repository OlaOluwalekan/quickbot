'use client'

import { setSearchModalIsOpen } from '@/features/generalSlice'
import { RootState } from '@/store'
import { ResponseProps } from '@/types/chats.interface'
import { getSnippetWithHighlight } from '@/utils/search'
import clsx from 'clsx'
import Link from 'next/link'
import { IoChatbubbleEllipsesOutline } from 'react-icons/io5'
import { useDispatch, useSelector } from 'react-redux'

const ResultResponse = ({
  id,
  chat,
  chatId,
  createdAt,
  response,
  question,
}: ResponseProps) => {
  const { searchText } = useSelector((store: RootState) => store.general)
  let render = getSnippetWithHighlight(response, searchText)
  const dispatch = useDispatch()

  return (
    <Link
      href={`/chat/c/${chatId}${searchText ? `?q=${searchText}` : ''}#${id}`}
      onClick={() => dispatch(setSearchModalIsOpen(false))}
    >
      <div
        className={clsx(
          'flex items-start gap-2 px-4 py-1.5 rounded-md hover:bg-purple/30 border-b-[1px] border-purple/20'
        )}
      >
        <span className='bg-lemon/35 text-lemon flex w-7 aspect-square rounded-full justify-center items-center'>
          <IoChatbubbleEllipsesOutline />
        </span>

        <section className='text-sm flex-1'>
          {/* <p>{response.substring(0, 100)}</p> */}
          <p dangerouslySetInnerHTML={{ __html: render }}></p>
          <article className='flex gap-1.5 text-xs'>
            <span>response in</span>
            <span className='text-lemon'>{chat.title}</span>
          </article>
        </section>
      </div>
    </Link>
  )
}

export default ResultResponse
