'use client'

import { ResponseProps } from '@/types/chats.interface'
import React, { useEffect, useRef, useState, useTransition } from 'react'
import Response from './Response'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import InlineLoading from '../loading/InlineLoading'
import { getChatById } from '@/utils/actions/chat'
import { setCurrentPageId, setCurrentPageTitle } from '@/features/generalSlice'

const ResponseList = ({
  data,
  image,
}: {
  data: ResponseProps[]
  image: string | null
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const { loadingResponse, chatInputHeight, currentPageTitle } = useSelector(
    (store: RootState) => store.general
  )
  const [pending, startTransition] = useTransition()
  const dispatch = useDispatch()
  const [urlFragment, setUrlFragment] = useState('#')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      setUrlFragment(hash)
    }

    startTransition(() => {
      getChatById(data[0].chatId).then((res) => {
        if (res.success) {
          dispatch(setCurrentPageTitle(res.data.chat.title))
          dispatch(setCurrentPageId(res.data.chat.id))
        }
      })
    })
  }, [])

  useEffect(() => {
    document.title = currentPageTitle
  }, [currentPageTitle])

  useEffect(() => {
    if (!urlFragment) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [data, chatInputHeight, urlFragment])

  return (
    <div
      className='w-full pt-2 pb-5 overflow-auto scrollbar-none flex flex-col'
      style={{
        height: `calc(100% - ${chatInputHeight} + 50px)`,
      }}
    >
      {data.map((response) => {
        return <Response key={response.id} response={response} image={image} />
      })}

      {loadingResponse && <InlineLoading />}
      <div ref={bottomRef}></div>
    </div>
  )
}

export default ResponseList
