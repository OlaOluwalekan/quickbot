import { auth } from '@/auth'
import ChatClient from '@/components/chats/ChatClient'
import TemplatePrompts from '@/components/chats/TemplatePrompts'
import { getTrendingTopics } from '@/utils/actions/location'
import Link from 'next/link'

const ChatPage = async () => {
  // get authenticated user session
  const session = await auth()

  // load template prompts to give user prompt suggestion
  // const templateResponse = await getTrendingTopics()

  const samplePrompts = [
    {
      name: 'What is the weather like today?',
      domain: 'weather',
    },
    {
      name: 'Tell me a joke',
      domain: 'general',
    },
    {
      name: 'What is the capital of France?',
      domain: 'geography',
    },
    {
      name: 'How do I make a cake?',
      domain: 'cooking',
    },
  ]

  // if failed to load template prompts, return error message
  // TODO: add a more user friendly interface when template prompts failed to load
  // if (templateResponse.status !== 'SUCCESS') {
  //   return (
  //     <div className='flex flex-col justify-center items-center h-full w-full'>
  //       Failed to load Prompts
  //     </div>
  //   )
  // }

  // const templatePrompts = templateResponse.trending.trends.slice(0, 4)

  return (
    <div className='flex flex-col justify-center items-center h-full w-full'>
      <ChatClient userId={session?.user?.id as string} chatId='' />
      <TemplatePrompts
        data={samplePrompts}
        userId={session?.user?.id as string}
        existingToken={(session?.user as any).token}
      />
    </div>
  )
}

export default ChatPage
