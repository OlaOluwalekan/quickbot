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
    <div className='flex justify-between items-center py-4 px-6'>
      <div className='flex gap-4 items-center'>
        <section className='flex gap-2 items-center'>
          <Logo size='icon' />
          <AppName />
          {/* <h2>Quickbot</h2> */}
        </section>

        <section className='flex gap-2'>
          {navLink.map((link) => {
            return (
              <Link href={link.link} key={link.id} className={clsx('text-sm')}>
                {link.name}
              </Link>
            )
          })}
        </section>
      </div>

      <div className='hidden gap-2 md:flex'>
        <LinkButton
          size='small'
          type='button'
          text='Signup'
          theme='outline'
          href='/auth/register'
        />
        <LinkButton
          size='small'
          type='button'
          text='Login'
          theme='primary'
          href='/auth/login'
        />
      </div>
    </div>
  )
}

export default Header
