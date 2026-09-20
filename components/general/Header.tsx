import Link from 'next/link'
import AppName from '../logo/AppName'
import Logo from '../logo/Logo'
import clsx from 'clsx'
import LinkButton from '../ui/button/LinkButton'

const navLink = [
  {
    id: '1',
    name: 'Home',
    link: '/',
  },
  {
    id: '2',
    name: 'Chat',
    link: '/chat',
  },
  {
    id: '3',
    name: 'Account',
    link: '/settings',
  },
]

const Header = () => {
  return (
    <div className='flex justify-between items-center py-5 px-6 md:px-12 w-full max-w-[1200px] mx-auto'>
      <div className='flex items-center gap-12'>
        <Link href="/" className='flex gap-2 items-center'>
          <Logo size='icon' />
          <AppName />
        </Link>

        <nav className='hidden md:flex gap-8'>
          {navLink.map((link) => {
            return (
              <Link
                href={link.link}
                key={link.id}
                className={clsx('text-[15px] font-medium text-base-content/80 hover:text-primary transition-colors dark:text-dark-base-content/80 dark:hover:text-dark-primary-content')}
              >
                {link.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className='flex gap-4 items-center'>
        <div className='hidden md:block'>
          <Link
            href='/auth/login'
            className='text-[15px] font-medium text-base-content/80 hover:text-primary transition-colors mr-6 dark:text-dark-base-content/80 dark:hover:text-dark-primary-content'
          >
            Login
          </Link>
        </div>
        <LinkButton
          size='medium'
          type='button'
          text='Sign Up'
          theme='primary'
          href='/auth/register'
        />
      </div>
    </div>
  )
}

export default Header
