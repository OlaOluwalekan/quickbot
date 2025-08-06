import { auth } from '@/auth'
import Search from '@/components/search/Search'
import SearchModal from '@/components/search/SearchModal'

const SearchModalPage = async () => {
  const session = await auth()
  const userInfo = session?.user

  return (
    <SearchModal>
      <Search />
    </SearchModal>
  )
}

export default SearchModalPage
