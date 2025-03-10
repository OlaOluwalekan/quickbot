import { ChatProps, ResponseProps } from '@/types/chats'
import { getChatById } from '@/utils/actions/chat'
import { getSnippetWithHighlight } from '@/utils/search'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export const ChatSearchResult = ({
  result,
  searchText,
  setSearchText,
}: {
  result: ChatProps
  searchText: string
  setSearchText: (text: string) => void
}) => {
  let render = getSnippetWithHighlight(result.title, searchText)

  return (
    <Link
      href={`/chat/${result.id}`}
      className='px-2 py-1 hover:bg-base-300/30 block'
      onClick={() => setSearchText('')}
      dangerouslySetInnerHTML={{ __html: render }}
    ></Link>
  )
}

export const ResponseSearchResult = ({
  result,
  searchText,
  setSearchText,
}: {
  result: ResponseProps
  searchText: string
  setSearchText: (text: string) => void
}) => {
  let render = getSnippetWithHighlight(result.response, searchText)
  const [title, setTitle] = useState('')

  useEffect(() => {
    getChatById(result.chatId).then((res) => {
      if (res.success) {
        setTitle(res.data.chat.title)
      }
    })
  }, [searchText])

  return (
    <Link
      href={`/chat/${result.chatId}#${result.id}`}
      className='px-2 py-1 hover:bg-base-300/30 flex flex-col'
      onClick={() => setSearchText('')}
    >
      <span className='text-[10px] bg-primary/30 px-1 py-[1px] rounded-sm w-fit'>
        {title}
      </span>
      <div dangerouslySetInnerHTML={{ __html: render }}></div>
    </Link>
  )
}
