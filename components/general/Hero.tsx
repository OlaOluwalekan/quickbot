import { typingTextHeroData } from '@/data/typingText'
import TypingText from '../ui/text/TypingText'
import { Inter, Irish_Grover } from 'next/font/google'
import AppName from '../logo/AppName'
import LinkButton from '../ui/button/LinkButton'
import Image from 'next/image'

const irish = Irish_Grover({ subsets: ['latin'], weight: '400' })
const inter = Inter({ subsets: ['latin'], weight: '400' })

const Hero = () => {
  return (
    <div className='flex flex-col justify-center items-center'>
      <TypingText
        texts={typingTextHeroData}
        className={`font-semibold inline text-4xl text-base-content dark:text-dark-base-content ${irish.className}`}
        cursorStyleClass={`inline text-3xl ${inter.className}`}
      />
      <p className='w-[90%] text-center text-base-content dark:text-dark-base-content my-5 max-w-[700px] md'>
        Revolutionize Your conversation. Unlock the power of instant assistance
        with <AppName />, your companion AI chatbot designed to streamline your
        tasks and boost productivity.
      </p>
      <LinkButton
        href='/auth/register'
        size='medium'
        text='Chat Now'
        theme='primary'
      />
      <Image
        width='200'
        height='150'
        src='/hero-banner.png'
        alt='Banner'
        className='w-full'
      />
    </div>
  )
}

export default Hero
