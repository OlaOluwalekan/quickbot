'use client'

import { useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { LiaTimesSolid } from 'react-icons/lia'

const SearchModal = ({ children }: { children: ReactNode }) => {
  const router = useRouter()

  return (
    <div
      className='w-screen h-screen bg-black-main/30 backdrop-blur-xs flex justify-center items-center fixed top-0 left-0 z-30'
      onClick={(e) => router.back()}
    >
      <div
        className='w-[90%] max-w-[500px] flex flex-col justify-center items-center bg-white-main dark:bg-eerie-black px-3 py-3'
        onClick={(e) => e.stopPropagation()}
      >
        <article className='w-full flex justify-end'>
          <button
            className='bg-error/35 text-error px-2 py-2 aspect-square rounded-full cursor-pointer'
            onClick={() => router.back()}
          >
            <LiaTimesSolid />
          </button>
        </article>
        {children}
      </div>
    </div>
  )
}

export default SearchModal
