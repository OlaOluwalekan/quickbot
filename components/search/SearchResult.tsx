'use client'

import { RootState } from '@/store'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import ResultChat from './ResultChat'
import ResultResponse from './ResultResponse'
import { ChatProps } from '@/types/chats.interface'

const SearchResult = () => {
  const { searchResult, searchText } = useSelector(
    (store: RootState) => store.general
  )

  useEffect(() => {
    const dates = (
      searchResult.filter((item) => {
        if ('title' in item) {
          return item
        }
      }) as ChatProps[]
    ).map((date) => {
      return date.updatedAt
    })
    // console.log(dates)
  }, [searchResult])

  return (
    <div>
      <article className='py-3 px-4 border-b-[1px] border-medium-grey/30 bg-medium-grey/20'>
        <p className='text-sm'>
          {searchResult.length} results found{' '}
          {searchText && (
            <>
              "for" <span className='text-lemon'>{searchText}</span>
            </>
          )}
        </p>
      </article>
      <div className='max-h-[250px] scrollbar-thin overflow-auto'>
        {searchResult.length === 0 ? (
          <div>No result</div>
        ) : (
          <div>
            {searchResult.map((result) => {
              return (
                <div key={result.id}>
                  {'title' in result ? (
                    <ResultChat {...result} />
                  ) : (
                    <ResultResponse {...result} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchResult
