'use client'

import { LiaTimesSolid } from 'react-icons/lia'
import RadioInput from '../ui/inputs/RadioInput'
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react'
import { searchChat } from '@/utils/actions/chat'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import { setSearchResult } from '@/features/generalSlice'

const SearchForm = () => {
  const [searchFormData, setSearchFormData] = useState<{
    searchText: string
    searchType: 'chat' | 'all'
  }>({
    searchText: '',
    searchType: 'all',
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const [searching, startSearching] = useTransition()
  const { authUserId, currentChatId } = useSelector(
    (store: RootState) => store.general
  )
  const dispatch = useDispatch()

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const name = e.target.name
    const value = e.target.value
    setSearchFormData({ ...searchFormData, [name]: value })
  }

  useEffect(() => {
    inputRef.current?.focus()
    console.log(authUserId, currentChatId)
  }, [])

  useEffect(() => {
    startSearching(() => {
      searchChat(
        searchFormData.searchText,
        searchFormData.searchType,
        authUserId,
        currentChatId
      ).then((res) => {
        // console.log(res)
        dispatch(setSearchResult(res))
      })
    })
  }, [searchFormData])

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault()
  }

  return (
    <form
      className='flex flex-col gap-5 p-4 border-b-[1px] border-medium-grey/30 dark:border-black'
      onSubmit={handleFormSubmit}
    >
      <div className='w-full px-3 py-2 border-[1px] border-medium-grey/30 rounded-md flex gap-2 focus-within:border-2'>
        <input
          type='text'
          placeholder='Type to search'
          className='flex-1 focus:outline-none'
          name='searchText'
          value={searchFormData.searchText}
          onChange={handleChange}
          ref={inputRef}
        />
        {searchFormData.searchText && (
          <button
            type='button'
            className='text-error cursor-pointer text-xs w-6 aspect-square rounded-full hover:bg-error/35  flex justify-center items-center'
            onClick={() => {
              setSearchFormData({ ...searchFormData, searchText: '' })
              inputRef.current?.focus()
            }}
          >
            <LiaTimesSolid />
          </button>
        )}
      </div>

      <div className='flex flex-col tablet:flex-row gap-2'>
        <RadioInput
          name='searchType'
          id='all'
          label='Search all chats'
          value='all'
          onChange={handleChange}
          isChecked={searchFormData.searchType === 'all'}
        />
        {currentChatId && (
          <RadioInput
            name='searchType'
            id='chat'
            label='Search current chat only'
            value='chat'
            onChange={handleChange}
            isChecked={searchFormData.searchType === 'chat'}
          />
        )}
      </div>
    </form>
  )
}

export default SearchForm
