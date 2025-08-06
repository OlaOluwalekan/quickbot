import SearchForm from './SearchForm'
import SearchResult from './SearchResult'

const Search = () => {
  return (
    <div className='w-full'>
      <section className='border-b-[1px] border-medium-grey/30 dark:border-black py-4 px-4 flex flex-col gap-2'>
        <h3 className='text-lg font-semibold'>Search Conversation</h3>
        <p className='text-sm opacity-70'>
          You can search within a chat or all chats
        </p>
      </section>

      <SearchForm />

      <SearchResult />
    </div>
  )
}

export default Search
