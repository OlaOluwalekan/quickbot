'use client'

import { setSearchModalIsOpen } from '@/features/generalSlice'
import { ReactNode } from 'react'
import { LiaTimesSolid } from 'react-icons/lia'
import { useDispatch } from 'react-redux'

const SearchModal = ({ children }: { children: ReactNode }) => {
  const dispatch = useDispatch()

  return (
    <div
      className='w-screen h-screen bg-black-main/30 backdrop-blur-sm flex justify-center items-center fixed top-0 left-0 z-30'
      onClick={() => dispatch(setSearchModalIsOpen(false))}
    >
      <div
        className='w-[90%] max-w-[700px] flex flex-col justify-center items-center bg-platinum dark:bg-eerie-black px-3 py-3 rounded-xl'
        onClick={(e) => e.stopPropagation()}
      >
        <article className='w-full flex justify-end'>
          <button
            className='bg-error/35 text-error px-2 py-2 aspect-square rounded-full cursor-pointer'
            onClick={() => dispatch(setSearchModalIsOpen(false))}
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
