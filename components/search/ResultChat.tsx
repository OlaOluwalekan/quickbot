'use client'

import { setSearchModalIsOpen } from '@/features/generalSlice'
import { RootState } from '@/store'
import { ChatProps } from '@/types/chats.interface'
import { formatCustomDate } from '@/utils/format'
import { getSnippetWithHighlight } from '@/utils/search'
import Link from 'next/link'
import { FiFolder } from 'react-icons/fi'
import { useDispatch, useSelector } from 'react-redux'

const ResultChat = ({ title, id, updatedAt }: ChatProps) => {
  const { searchText } = useSelector((store: RootState) => store.general)
  const dispatch = useDispatch()
  let render = getSnippetWithHighlight(title, searchText)

  return (
    <Link
      href={`/chat/c/${id}${searchText ? `?q=${searchText}` : ''}`}
      onClick={() => dispatch(setSearchModalIsOpen(false))}
    >
      <div className='flex items-start gap-2 px-4 py-1.5 rounded-md hover:bg-purple/30 border-b-[1px] border-purple/20'>
        <span className='bg-teal-green/35 text-teal-green flex w-7 aspect-square rounded-full justify-center items-center'>
          <FiFolder />
        </span>

        <section>
          <p
            className='text-sm'
            dangerouslySetInnerHTML={{ __html: render }}
          ></p>
          <article className='text-xs flex gap-1'>
            <span>Updated</span>
            <time>{formatCustomDate(updatedAt.toISOString())}</time>
          </article>
        </section>
      </div>
    </Link>
  )
}

export default ResultChat
