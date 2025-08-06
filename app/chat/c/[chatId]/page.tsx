import { auth } from '@/auth'
import ChatClient from '@/components/chats/ChatClient'
import ChatInput from '@/components/chats/ChatInput'
import ResponseList from '@/components/chats/ResponseList'
import NotFound from '@/components/not-found/NotFound'
import { getChatById } from '@/utils/actions/chat'
import { getResponses } from '@/utils/actions/response'
import React from 'react'

const SingleChatPage = async ({
  params,
}: {
  params: Promise<{ chatId: string }>
}) => {
  // get logged in user session
  const session = await auth()
  const chatId = (await params).chatId
  // console.log('session=> ', session)

  // get all responses in a particular chat by the chatId
  const responsesRes = await getResponses(chatId)

  // return error page if request is unsuccessful
  if (!responsesRes.data) {
    return <NotFound />
  }

  const responses = responsesRes.data.responses

  if (!responses || responses.length === 0) {
    return <NotFound />
  }

  // get the chat details associated with the first response in the chat
  const chatResponse = await getChatById(responses[0].chatId)
  const chat = chatResponse.data.chat

  if (!chat) {
    return <NotFound />
  }

  // if the chat is not created by the authenticated user, then return error
  // this will later be used while allowing sharing of chat information to other users
  if (chat.createdBy !== session?.user?.id) {
    return (
      <div className='w-full h-full flex justify-center items-center bg-pink-300'>
        Access Denied
      </div>
    )
  }

  return (
    <div className='h-full'>
      <div className='h-[calc(100vh-150px)] w-full overflow-auto scroll-smooth'>
        <div className='w-[90%] mx-auto'>
          <ResponseList
            data={responses}
            image={session?.user?.image as string | null}
          />
        </div>
        <ChatClient chatId={chatId} userId={session?.user?.id as string} />
      </div>
      <div className=''>
        <ChatInput userId={session?.user?.id as string} existingToken={10000} />
      </div>
    </div>
  )
}

export default SingleChatPage
