import { Inter } from 'next/font/google'
import LinkButton from '../ui/button/LinkButton'
import { BsArrowRight } from 'react-icons/bs'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

const Hero = () => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-center w-full max-w-[1200px] mx-auto py-12 md:py-24 gap-12'>
      <div className='flex flex-col justify-center items-start w-full md:w-1/2 gap-6'>
        <div className='inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-medium text-sm border border-primary/20 dark:bg-primary/20 dark:text-dark-primary-content'>
          Meet Owinta AI v2.0
        </div>

        <h1 className={`text-5xl md:text-6xl lg:text-7xl font-bold text-base-content dark:text-dark-base-content leading-tight tracking-tight ${inter.className}`}>
          The Intelligent AI Chatbot
        </h1>

        <p className='text-lg md:text-xl text-base-content/70 dark:text-dark-base-content/70 max-w-[600px] leading-relaxed'>
          Experience the next generation of conversational AI. Owinta AI helps you automate tasks, generate ideas, and find answers instantly with unparalleled accuracy.
        </p>

        <div className='flex flex-col sm:flex-row gap-4 mt-4'>
          <LinkButton
            href='/auth/register'
            size='large'
            text='Get Started Free'
            theme='primary'
          />
          <a href='#features' className='inline-flex items-center justify-center font-medium transition-colors py-2 px-8 rounded-full border-2 border-base-200 bg-transparent text-base-content hover:border-base-300 dark:border-dark-base-200 dark:text-dark-base-content gap-2'>
            Explore Features
            <BsArrowRight className='text-lg' />
          </a>
        </div>
      </div>

      <div className='w-full md:w-1/2 flex justify-center items-center'>
        <div className='w-full max-w-[500px] relative'>
          {/* Main Hero Image Placeholder */}
          <div className='w-full aspect-square bg-base-200/50 dark:bg-dark-base-200/50 rounded-2xl flex items-center justify-center border border-base-200 dark:border-dark-base-200 overflow-hidden shadow-2xl relative'>
            <div className='absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10'>
              <span className='text-base-content/80 dark:text-dark-base-content/80 mb-2 font-bold'>
                [Image Placeholder]
              </span>
              <p className='text-sm text-base-content/70 dark:text-dark-base-content/70 font-medium bg-base-100/50 dark:bg-dark-base-100/50 p-2 rounded'>
                Abstract 3D illustration of an AI brain or futuristic chat interface
              </p>
              <div className='flex gap-4 mt-4 text-xs text-base-content/60 dark:text-dark-base-content/60 bg-base-100/50 dark:bg-dark-base-100/50 p-1 px-3 rounded'>
                <span>Size: 500x500px</span>
                <span>~ 150kb (WebP)</span>
              </div>
            </div>
            {/* Decorative elements */}
            <div className='absolute top-10 -left-6 w-24 h-24 bg-primary/20 blur-2xl rounded-full z-0'></div>
            <div className='absolute bottom-10 -right-6 w-32 h-32 bg-secondary/20 blur-2xl rounded-full z-0'></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero
