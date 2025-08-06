import { auth } from '@/auth'
import Search from '@/components/search/Search'

const SearchPage = async () => {
  const session = await auth()
  const userInfo = session?.user

  return (
    <div className='w-full h-full flex justify-center items-center'>
      <div className='w-[90%] mx-auto'>
        <div className='bg-platinum dark:bg-eerie-black rounded-xl'>
          <Search />
        </div>
      </div>
    </div>
  )
}

export default SearchPage
