'use client'

import Image from 'next/image'
import LinkButton from '../ui/button/LinkButton'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { setCurrentPageTitle } from '@/features/generalSlice'

const NotFound = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(setCurrentPageTitle(''))
  }, [])

  return (
    <div className='w-full flex flex-col justify-center items-center gap-2 overflow-auto scrollbar-thin py-8'>
      <div className='w-[80%] max-w-[400px]'>
        <Image
          width='196'
          height='248'
          src='/404.svg'
          alt='Logo'
          className='w-full'
        />
      </div>
      <div className='flex flex-col justify-center items-center gap-2 mt-[-60px] w-[90%] max-w-[600px] text-center'>
        <h3 className='text-6xl font-bold laptop:text-9xl'>Oops!</h3>
        <p className='text-lg font-semibold'>Sorry! Can't talk here</p>
        <p>This page has either been removed or does not exist</p>
      </div>
      <div>
        <LinkButton
          text='Back Home'
          href='/'
          className='bg-lemon text-white-main'
        />
      </div>
    </div>
  )
}

export default NotFound
