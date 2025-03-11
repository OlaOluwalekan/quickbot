'use client'

import {
  setAIResponse,
  setCurrentPageId,
  setCurrentPageTitle,
  setLoadingResponse,
} from '@/features/generalSlice'
import { useEffect, useTransition } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import InlineLoading from '../loading/InlineLoading'
import { RootState } from '@/store'
import { getResponseFromAI } from '@/utils/actions/response'
import { useRouter } from 'next/navigation'

const TemplatePrompts = ({
  data,
  userId,
  existingToken,
}: {
  data: { name: string; domain: string | null }[]
  userId: string
  existingToken: number
}) => {
  const dispatch = useDispatch()
  const { loadingResponse, chatInputHeight } = useSelector(
    (store: RootState) => store.general
  )
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // reset the page title when navigated to general chat page
  useEffect(() => {
    dispatch(setCurrentPageTitle('New Chat'))
    dispatch(setCurrentPageId(null))
  }, [])

  // handle clicking of a template prompt to get ai response
  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      dispatch(setLoadingResponse(true))
      getResponseFromAI(formData, window.location.pathname, existingToken).then(
        (res) => {
          if (res.success) {
            dispatch(setAIResponse(res.data.text))
          }
          if (res?.data.chatId) {
            router.push(`/chat/${res.data.chatId}`)
          }
          dispatch(setLoadingResponse(false))
        }
      )
    })
  }

  return (
    <div
      className='w-full flex flex-col'
      style={{
        height: `calc(100vh - ${chatInputHeight} - 200px)`,
      }}
    >
      <div className='h-full w-full flex justify-center items-center'>
        <div className='flex flex-wrap justify-center items-center gap-2'>
          {data.map((item, i) => {
            return (
              <form action={handleSubmit} key={i}>
                <input type='hidden' id='id' name='id' value={userId} />
                <input
                  type='hidden'
                  name='question'
                  id='question'
                  value={item.name}
                />
                <button
                  type='submit'
                  className='w-[200px] h-[100px] border-base-200 border-2 px-2 py-2 flex flex-col rounded hover:bg-base-200'
                >
                  <span className='text-xs flex w-fit px-1 bg-secondary/50 rounded-sm'>
                    {item.domain || 'general'}
                  </span>
                  <section className='flex-grow flex justify-center items-center'>
                    <p className='text-sm text-center'>{item.name}</p>
                  </section>
                </button>
              </form>
            )
          })}
        </div>
      </div>
      {loadingResponse && <InlineLoading />}
    </div>
  )
}

export default TemplatePrompts
