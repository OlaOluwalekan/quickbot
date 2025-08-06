'use client'

import { ChatProps } from '@/types/chats.interface'
import { formatCustomDate } from '@/utils/format'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FiFolder } from 'react-icons/fi'

const ResultChat = ({ title, id, updatedAt }: ChatProps) => {
  const router = useRouter()

  return (
    <button
      type='button'
      onClick={() => {
        router.back()
        router.push(`/chat/c/${id}`)
      }}
      className='w-full cursor-pointer'
    >
      <div className='flex items-start gap-2 px-4 py-1.5 rounded-md hover:bg-purple/30 border-b-[1px] border-purple/20'>
        <span className='bg-teal-green/35 text-teal-green flex w-7 aspect-square rounded-full justify-center items-center'>
          <FiFolder />
        </span>

        <section>
          <p className='text-sm'>{title}</p>
          <article className='text-xs flex gap-1'>
            <span>Updated</span>
            <time>{formatCustomDate(updatedAt.toLocaleDateString())}</time>
          </article>
        </section>
      </div>
    </button>
  )
}

export default ResultChat
