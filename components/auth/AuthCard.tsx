'use client'

import { AuthCardProps } from '@/types/auth'
import Logo from '../logo/Logo'
import Link from 'next/link'
import OAuthCard from './OAuthCard'

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
    <div className='py-6 w-[90%] flex flex-col items-center justify-center bg-base-100/60 dark:bg-dark-base-100/60 text-base-content dark:text-dark-base-content'>
      <div className='flex flex-col w-full items-center justify-center'>
        <h2 className='text-2xl font-bold my-1 md:text-5xl'>{page}</h2>
        <p className='my-1 md:text-xl'>{headerText}</p>
      </div>
      <div className='w-full flex justify-center items-center'>
        {/* CARD CHILDREN */}
        <div className='w-[90%] max-w-[400px] p-1'>
          {children}
          <article className='flex justify-center items-center text-sm my-2 gap-1'>
            {backText}?
            <Link href={`/auth/${backLink}`} className='underline capitalize'>
              {backLink} here
            </Link>
          </article>

          {/* divider */}
          <div className='my-4 text-sm flex items-center'>
            <div className='h-0.5 bg-secondary dark:bg-dark-secondary w-full'></div>
            <div className='w-full text-center'>Or Login With</div>
            <div className='h-0.5 bg-secondary dark:bg-dark-secondary w-full'></div>
          </div>

          {/* OAuth Login Section - GitHub and Google */}
          <section>
            <OAuthCard />
          </section>
        </div>
      </div>
    </div>
  )
}

export default AuthCard
