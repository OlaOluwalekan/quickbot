'use client'

import { toggleMobileNavOpen } from '@/features/generalSlice'
import { FaBarsStaggered } from 'react-icons/fa6'
import { useDispatch } from 'react-redux'

const ChatHeader = () => {
  const dispatch = useDispatch()

  return (
    <div className='border-b-[1px] border-platinum dark:border-eerie-black'>
      <div className='w-[90%] mx-auto flex justify-between items-center py-3'>
        <button
          className='text-lg cursor-pointer hover:bg-lemon p-2 rounded-md laptop:hidden'
          onClick={() => dispatch(toggleMobileNavOpen(true))}
        >
          <FaBarsStaggered />
        </button>

        {/* USER ICON */}
        <div>user icon</div>
      </div>
    </div>
  )
}

export default ChatHeader
