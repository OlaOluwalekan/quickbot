import Features from '@/components/home/Features'
import Header from '@/components/general/Header'
import Hero from '@/components/home/Hero'

const Home = () => {
  return (
    <div className='w-screen h-screen flex flex-col overflow-auto scrollbar-thin scroll-smooth'>
      <div className='w-full'>
        <Header />
      </div>
      <div className='flex grow w-full mx-auto flex-col justify-center items-center gap-3'>
        {/* HERO */}
        <Hero />

        {/* FEATURES */}
        <Features />
      </div>
    </div>
  )
}

export default Home
