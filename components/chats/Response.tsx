import { ResponseProps } from '@/types/chats.interface'
import UserPromptCallout from './UserPromptCallout'
import BotResponseCallout from './BotResponseCallout'

const Response = ({
  response,
  image,
}: {
  response: ResponseProps
  image: string | null
}) => {
  return (
    <div id={response.id} className='w-full flex flex-col gap-2 mb-4'>
      <UserPromptCallout response={response} image={image} />

      <BotResponseCallout response={response} />
    </div>
  )
}

export default Response
