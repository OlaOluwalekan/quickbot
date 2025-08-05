'use client'

import { toggleMobileNavOpen } from '@/features/generalSlice'
import { FaBarsStaggered } from 'react-icons/fa6'
import { GoSearch } from 'react-icons/go'
import { useDispatch } from 'react-redux'
import UserProfile from './user-profile/UserProfile'

const ChatHeader = ({ userData }: { userData: any }) => {
  const dispatch = useDispatch()

  return (
    <div className='border-b-[1px] border-platinum dark:border-eerie-black'>
      <div className='w-[90%] mx-auto flex justify-between items-center py-3'>
        <section className='flex gap-2 items-center'>
          <button
            className='text-lg cursor-pointer hover:bg-lemon p-2 rounded-md laptop:hidden'
            onClick={() => dispatch(toggleMobileNavOpen(true))}
          >
            <FaBarsStaggered />
          </button>

          <button className='flex gap-1 items-center bg-platinum dark:bg-eerie-black hover:bg-teal-green/40 tablet:hover:bg-platinum tablet:dark:hover:bg-eerie-black tablet:hover:text-black-main tablet:dark:hover:text-white-main hover:text-teal-green tablet:py-1 rounded-md cursor-pointer'>
            <span className='p-2 flex aspect-square'>
              <GoSearch />
            </span>
            <input
              type='text'
              placeholder='Search...'
              className='focus:outline-none hidden tablet:block'
            />
          </button>
        </section>

        {/* USER ICON */}
        <div>
          <UserProfile data={userData} />
        </div>
      </div>
    </div>
  )
}

export default ChatHeader
