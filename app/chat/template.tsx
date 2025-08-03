import { auth } from '@/auth'
import ChatDesktopHeader from '@/components/chats/ChatDesktopHeader'
import ChatHeader from '@/components/chats/ChatHeader'
import ChatInput from '@/components/chats/ChatInput'
import ChatMobileHeader from '@/components/chats/ChatMobileHeader'
import Sidebar from '@/components/chats/Sidebar'
import { ChatProps } from '@/types/chats.interface'
import { getChats } from '@/utils/actions/chat'
import { ReactNode } from 'react'

const Template = async ({ children }: { children: ReactNode }) => {
  // get authenticated user session
  const session = await auth()
  let chats: ChatProps[] = []
  let dates: string[] = []
  let grouped: Record<string, ChatProps[]> = {}

  // get chats created by the user by the userId
  if (session?.user?.id) {
    const chatResponse = await getChats(session?.user?.id)
    if (chatResponse.data) {
      chats = chatResponse.data.chats
      dates = chatResponse.data.dates
      grouped = chatResponse.data.grouped
    } else {
      chats = []
    }
  }

  return (
    <div className='h-screen w-screen flex overflow-hidden'>
      <Sidebar userData={session?.user} chats={chats} dates={dates} />

      <div className='w-full h-full'>
        {/* CHAT HEADER */}
        <ChatHeader />

        <div className='w-full h-[calc(100vh-50px)] overflow-auto'>
          <div className='w-[90%] mx-auto'>{children}</div>
        </div>
      </div>
    </div>
  )
}

export default Template
