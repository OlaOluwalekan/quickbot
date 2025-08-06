'use client'

import { RootState } from '@/store'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import ResultChat from './ResultChat'
import ResultResponse from './ResultResponse'

const SearchResult = () => {
  const { searchResult } = useSelector((store: RootState) => store.general)

  useEffect(() => {
    console.log(searchResult)
  }, [searchResult])

  return (
    <div className='py-4 max-h-[200px] scrollbar-thin overflow-auto'>
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
  )
}

export default SearchResult
