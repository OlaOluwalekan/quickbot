import { ReactNode } from 'react'
import Logo from '../logo/Logo'
import AppName from '../logo/AppName'
import Link from 'next/link'
import { authSamplePrompts } from '@/data/samplePrompts'
import PromptCallout from '../home/PromptCallout'
import ResponseCallout from '../home/ResponseCallout'
import AuthSamplePrompt from './AuthSamplePrompt'

const AuthWrapper = ({ children }: { children: ReactNode }) => {
  return (
    // <div className='flex justify-center items-center min-h-screen bg-[url("/auth-bg-1.jpg")] bg-cover object-cover relative'>
    //   <div className='w-full h-full bg-black/5 absolute top-0 left-0'></div>
    //   <div className='w-full flex justify-center items-center z-20'>
    //     {children}
    //   </div>
    // </div>
    <div className='w-screen h-screen overflow-hidden relative laptop:flex'>
      <div className='w-full h-full bg-linear-to-bl from-teal-green to-purple dark:from-teal-dark dark:to-purple-dark'>
        <div className='w-[90%] mx-auto h-full py-3 flex flex-col justify-between'>
          <Link href='/' className='flex items-center w-full'>
            <Logo size={48} animate />
            <AppName className='ml-[-8px] text-2xl text-teal-green text-shadow-lg' />
          </Link>

          <section className='w-full flex flex-col gap-3'>
            <h3 className='text-2xl font-semibold'>Chat Smarter, Not Harder</h3>
            <p>
              Get instant, context-aware answers to any question—whether you
              need a quick fact, a deep explanation, or creative ideas at your
              fingertips.
            </p>
            <AuthSamplePrompt />
          </section>
        </div>
      </div>
      <div className='absolute w-full h-full top-0 left-0 laptop:relative bg-eerie-black/30 laptop:bg-white-main laptop:dark:bg-black backdrop-blur-xs laptop:backdrop-blur-none flex justify-center items-center'>
        <section className='w-full overflow-auto flex justify-center'>
          {children}
        </section>
      </div>
    </div>
  )
}

export default AuthWrapper
