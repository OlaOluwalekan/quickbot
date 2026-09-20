import Features from '@/components/general/Features'
import Header from '@/components/general/Header'
import Hero from '@/components/general/Hero'

const Home = () => {
  return (
    <div className='w-full min-h-screen flex flex-col bg-base-100 dark:bg-dark-base-100 overflow-x-hidden selection:bg-primary selection:text-primary-content'>
      {/* Background ambient glows */}
      <div className='fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none -z-10 dark:bg-primary/10'></div>
      <div className='fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/5 blur-[120px] pointer-events-none -z-10 dark:bg-secondary/10'></div>

      <header className='w-full border-b border-base-200/50 dark:border-dark-base-200/50 bg-base-100/80 dark:bg-dark-base-100/80 backdrop-blur-md sticky top-0 z-50'>
        <Header />
      </header>

      <main className='flex-1 w-full flex flex-col'>
        {/* HERO SECTION */}
        <section className='w-full px-4'>
          <Hero />
        </section>

        {/* FEATURES SECTION */}
        <section className='w-full px-4 bg-base-200/30 dark:bg-dark-base-200/20 border-y border-base-200/50 dark:border-dark-base-200/50'>
          <Features />
        </section>

        {/* CTA / BANNER SECTION */}
        <section className='w-full max-w-[1200px] mx-auto py-24 px-6 flex justify-center'>
          <div className='w-full bg-gradient-to-br from-primary to-accent rounded-3xl p-12 md:p-16 flex flex-col md:flex-row items-center justify-between shadow-2xl relative overflow-hidden'>
            <div className='absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3'></div>

            <div className='relative z-10 w-full md:w-2/3 mb-8 md:mb-0 text-center md:text-left'>
              <h2 className='text-3xl md:text-5xl font-bold text-white mb-4 leading-tight'>
                Ready to transform your productivity?
              </h2>
              <p className='text-white/80 text-lg max-w-[500px] mx-auto md:mx-0'>
                Join thousands of users who are already saving hours every week with Owinta AI.
              </p>
            </div>

            <div className='relative z-10 w-full md:w-1/3 flex justify-center md:justify-end'>
              <a
                href="/auth/register"
                className='px-8 py-4 bg-white text-primary font-bold rounded-full hover:scale-105 transition-transform shadow-lg hover:shadow-xl'
              >
                Start for free
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className='w-full py-8 text-center text-base-content/60 dark:text-dark-base-content/60 text-sm border-t border-base-200/50 dark:border-dark-base-200/50 mt-auto'>
        <p>&copy; {new Date().getFullYear()} Owinta AI. All rights reserved.</p>
      </footer>
    </div>
  )
}

export default Home
