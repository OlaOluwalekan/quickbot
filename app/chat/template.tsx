import { auth } from '@/auth'
import ChatDesktopHeader from '@/components/chats/ChatDesktopHeader'
import ChatInput from '@/components/chats/ChatInput'
import ChatMobileHeader from '@/components/chats/ChatMobileHeader'
import Sidebar from '@/components/chats/Sidebar'
import { ChatProps } from '@/types/chats'
import { getChats } from '@/utils/actions/chat'
import { ReactNode } from 'react'

const Template = async ({ children }: { children: ReactNode }) => {
  // get authenticated user session
  const session = await auth()
  let chats: ChatProps[] = []

  // get chats created by the user by the userId
  if (session?.user?.id) {
    const chatResponse = await getChats(session?.user?.id)
    if (chatResponse.data) {
      chats = chatResponse.data.chats
    } else {
      chats = []
    }
  }

  return (
    <div className='h-screen flex flex-col'>
      {/* header displayed on mobile screen */}
      <ChatMobileHeader userId={session?.user?.id as string} />
      <div className='flex flex-grow'>
        {/* sidebar containing list of all chats created by a user */}
        <Sidebar data={session?.user} chats={chats} />
        <div className='w-full h-full flex flex-col bg-primary pt-1'>
          {/* header displayed on larger screens */}
          <ChatDesktopHeader userId={session?.user?.id as string} />
          <div className='flex flex-col flex-grow bg-primary md:pt-3 md:pb-2 md:pr-2'>
            <section className='flex flex-grow flex-col bg-base-100 md:rounded-lg'>
              <section className='flex flex-grow flex-col items-end w-[90%] mx-auto max-w-[800px] relative'>
                {/* children */}
                <section className='h-[calc(100vh-125px)] w-full md:h-[calc(100vh-151px)] flex flex-col'>
                  {children}
                </section>
                {/* chat input where user type their questions */}
                <ChatInput
                  userId={session?.user?.id as string}
                  existingToken={(session?.user as any).token}
                />
              </section>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Template
