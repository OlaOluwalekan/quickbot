'use client'

import { FaSearch } from 'react-icons/fa'
import { ChangeEvent, useEffect, useState } from 'react'
import clsx from 'clsx'
import { searchChat } from '@/utils/actions/chat'
import { ChatProps, ResponseProps } from '@/types/chats'
import { ChatSearchResult, ResponseSearchResult } from './SearchResult'
import { usePathname } from 'next/navigation'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import { setSearchResultIsOpen } from '@/features/generalSlice'

const Search = ({ userId }: { userId: string }) => {
  const [searchText, setSearchText] = useState('')
  const [results, setResults] = useState<(ChatProps | ResponseProps)[]>([])
  const pathname = usePathname()
  const path = pathname.split('/')
  const { searchResultIsOpen } = useSelector(
    (store: RootState) => store.general
  )
  const dispatch = useDispatch()
  // console.log(path)

  const lastPath = path[path.length - 1]
  let chatId = ''
  if (lastPath.toLowerCase() !== 'chat') {
    chatId = lastPath
  }
  const [searchOption, setSearchOption] = useState(
    chatId ? 'this chat' : 'all chats'
  )

  // console.log(pathname)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
  }

  const search = () => {
    if (searchText) {
      dispatch(setSearchResultIsOpen(true))
    } else {
      dispatch(setSearchResultIsOpen(false))
      setResults([])
    }
    searchChat(searchText, searchOption, userId, chatId).then((res) => {
      setResults(res)
    })
  }

  useEffect(() => {
    search()
  }, [searchText, searchOption])

  return (
    <div>
      <form className='a-modal flex' onSubmit={handleSubmit}>
        <label
          className={clsx(
            'flex items-center bg-base-100 dark:bg-dark-base-100 rounded-md gap-2 rounded-tr-none rounded-br-none px-3 py-2'
          )}
        >
          {/* icon */}
          <span
            className={clsx('input-icon text-primary opacity-100 outline-none')}
          >
            <FaSearch />
          </span>

          {/* input */}
          <input
            type='text'
            className={clsx(
              'grow text-base-content dark:text-dark-base-content focus:outline-none text-sm'
            )}
            placeholder='Search'
            value={searchText}
            onChange={handleChange}
            onFocus={search}
          />
        </label>
        <select
          className='w-full max-w-xs bg-base-100 dark:bg-dark-base-100 text-base-content dark:text-dark-base-content rounded-md rounded-tl-none rounded-bl-none text-sm'
          onChange={(e) => setSearchOption(e.target.value)}
        >
          {chatId && <option value='this chat'>This Chat</option>}
          <option value='all chats'>All Chats</option>
        </select>
      </form>

      {searchResultIsOpen && (
        <div className='absolute z-20 bg-base-200 text-base-content w-[90vw] mx-auto left-0 right-0 top-16 px-4 py-3 shadow-xl rounded-md text-sm max-h-[400px] overflow-auto scrollbar-thin'>
          {results.length == 0 ? (
            <div>No match</div>
          ) : (
            <div className='flex flex-col'>
              {results.map((result, i) => {
                return (
                  <div
                    key={result.id}
                    className={clsx(
                      results.length - 1 !== i ? 'border-b-[1px]' : ''
                    )}
                  >
                    {'title' in result ? (
                      <ChatSearchResult
                        result={result}
                        searchText={searchText}
                        setSearchText={setSearchText}
                      />
                    ) : (
                      <ResponseSearchResult
                        result={result}
                        searchText={searchText}
                        setSearchText={setSearchText}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Search
