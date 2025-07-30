'use client'

import { navLinks } from '@/data/navLinkData'
import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NavLinks = () => {
  const pathname = usePathname()
  //   console.log('Current Pathname:', pathname)
  const isActive = (link: string) => pathname === link

  return (
    <div className='flex gap-4 items-center'>
      <section className='flex gap-2'>
        {navLinks.map((link) => {
          return (
            <Link
              href={link.link}
              key={link.id}
              className={clsx(
                'text-sm text-primary hover:underline',
                isActive(link.link) && 'underline'
              )}
            >
              {link.name}
            </Link>
          )
        })}
      </section>
    </div>
  )
}

export default NavLinks
