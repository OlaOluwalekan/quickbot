import { ChatProps, ResponseProps } from '@/types/chats'

import { getSnippetWithHighlight } from '@/utils/format'
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
  const render = getSnippetWithHighlight(result.title, searchText)

  return (
    <Link
      href={`/workspaces/${result.id}`}
      className='px-2 py-3 hover:bg-surface-2 block rounded-lg'
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
  const render = getSnippetWithHighlight(result.response, searchText)
  const [title, setTitle] = useState('')

  useEffect(() => {
    fetch(`/api/v1/workspaces/${result.chatId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data?.title) {
          setTitle(res.data.title)
        } else if (res.data?.chat?.title) {
          setTitle(res.data.chat.title)
        }
      })
      .catch(() => {})
  }, [result.chatId, searchText])

  return (
    <Link
      href={`/workspaces/${result.chatId}#${result.id}`}
      className='px-2 py-1 hover:bg-surface-2 flex flex-col rounded-lg'
      onClick={() => setSearchText('')}
    >
      <span className='text-[10px] bg-accent-soft text-accent px-1.5 py-0.5 rounded-sm w-fit'>
        {title}
      </span>
      <div dangerouslySetInnerHTML={{ __html: render }}></div>
    </Link>
  )
}
