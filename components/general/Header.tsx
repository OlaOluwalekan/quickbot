import AppName from '../logo/AppName'
import Logo from '../logo/Logo'
import LinkButton from '../ui/button/LinkButton'
import NavLinks from './NavLinks'

const Header = () => {
  return (
    <div className='flex tablet:justify-between items-center py-4 px-6 gap-3'>
      <section className='flex gap-0.5 items-center w-full'>
        <Logo size='icon' />
        <AppName />
      </section>

      <div className='w-full flex flex-grow'>
        <NavLinks />
      </div>

      <div className='hidden gap-2 md:flex'>
        <LinkButton type='button' text='Login' href='/auth/login' />
        <LinkButton
          type='button'
          text='Get Started'
          href='/auth/register'
          className='bg-lemon text-white-main text-nowrap px-1'
        />
      </div>
    </div>
  )
}

export default Header
