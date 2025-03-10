'use client'

import { RootState } from '@/store'
import { useSelector } from 'react-redux'
import Search from './Search'

const ChatDesktopHeader = ({ userId }: { userId: string }) => {
  const { currentPageTitle } = useSelector((store: RootState) => store.general)

  return (
    <header className='bg-primary text-primary-content hidden md:flex justify-center items-center'>
      <div className='w-[90%] mx-auto flex justify-between items-center py-0'>
        <div className='flex gap-3'>
          <h2 className='text-xl'>{currentPageTitle}</h2>
        </div>
        <Search userId={userId} />
      </div>
    </header>
  )
}

export default ChatDesktopHeader
