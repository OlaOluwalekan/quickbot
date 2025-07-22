'use client'

import { LogoProps } from '@/types/logo-types'
import clsx from 'clsx'
import Image from 'next/image'
import { sizeClass } from './logo.config'
import { useSelector } from 'react-redux'
import { RootState } from '@/store'

/**
 * Web app logo
 * @param {Object} props - component properties
 * @param {string} props.size - size of the logo - icon, text, small, normal, medium or large
 * @returns {JSX.Element} styled logo component
 */
const Logo = ({ size }: LogoProps): JSX.Element => {
  const { theme } = useSelector((store: RootState) => store.general)

  // image src attribute based on user selected theme
  const imageSrc = clsx({
    '/logo-light.png': theme === 'light',
    '/logo-black.png': theme === 'dark',
  })

  return (
    <Image
      width='196'
      height='248'
      src={imageSrc}
      alt='Logo'
      className={clsx(sizeClass(size))}
    />
  )
}

export default Logo
