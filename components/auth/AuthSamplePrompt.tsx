'use client'

import { authSamplePrompts } from '@/data/samplePrompts'
import PromptCallout from '../home/PromptCallout'
import ResponseCallout from '../home/ResponseCallout'
import { useEffect, useState } from 'react'

const AuthSamplePrompt = () => {
  const { prompt, character, responses } = authSamplePrompts

  return (
    <div className='w-full py-4 border-[1px] border-light-grey dark:border-light-grey/30 shadow-xl dark:shadow-gray-900 rounded-2xl bg-white-main dark:bg-eerie-black flex flex-col overflow-hidden'>
      <div className='px-4 h-full overflow-auto scrollbar-none hover:scrollbar-thin flex flex-col gap-3 text-xs'>
        <PromptCallout prompt={prompt} time={new Date()} className='text-xs' />

        {responses.map((res, index) => {
          return (
            <ResponseCallout
              className='text-xs'
              key={index}
              response={res}
              character={character}
              time={new Date()}
              animate
            />
          )
        })}
      </div>
    </div>
  )
}

export default AuthSamplePrompt
