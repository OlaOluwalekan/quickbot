import Link from 'next/link'
import { ReactNode } from 'react'

const CustomLink = ({
  href,
  children,
  ...props
}: {
  children: ReactNode
  href: string
}) => {
  return (
    <Link
      href={href}
      {...props}
      target='_blank'
      className='underline underline-offset-2 text-sm'
    >
      {children}
    </Link>
  )
}

export default CustomLink
