'use client'

import { AuthCardProps } from '@/types/auth'
import Logo from '../logo/Logo'
import Link from 'next/link'
import OAuthCard from './OAuthCard'
import { appName } from '@/data/app'

/**
 * This component wraps login and register authentication
 * @param children - The login or register form it wraps
 * @param page - Specifies the current page the use is on
 * @param headerText - The text to be displayed on the form head
 * @param backText - The text to be displayed on the form back link
 * @param backLink - The link to go to on back click, either register or login
 * @returns
 */
const AuthCard = ({
  children,
  page,
  headerText,
  backText,
  backLink,
}: AuthCardProps) => {
  return (
    <div className='flex flex-col gap-3 items-center justify-center'>
      {/* Auth Header */}
      <div className='flex flex-col gap-3 w-full items-center justify-center'>
        <Link href='/' className='laptop:hidden'>
          <Logo size={40} />
        </Link>
        <h3 className='text-2xl laptop:text-3xl font-semibold'>
          {page} to {appName}
        </h3>
        <p className='text-sm text-center'>{headerText}</p>
      </div>

      {/* OAuth Login Section - GitHub and Google */}
      <section className='w-full'>
        <OAuthCard />
      </section>

      {/* divider */}
      <div className='w-full text-sm grid grid-cols-[2fr_0.5fr_2fr] items-center'>
        <div className='h-[1px] shadow-sm w-full bg-dove-grey'></div>
        <div className='w-full text-center'>or</div>
        <div className='h-[1px] shadow-sm w-full bg-dove-grey'></div>
      </div>

      {/* CARD CHILDREN */}
      <div className='w-full'>{children}</div>

      {/* Auth Footer */}
      <div className='flex justify-center items-center text-sm my-2 gap-1'>
        {backText}?
        <Link
          href={`/auth/${backLink}`}
          className='underline capitalize text-lemon'
        >
          {backLink}
        </Link>
      </div>
    </div>
  )
}

export default AuthCard
