'use client'

import { RootState } from '@/store'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'

const SearchResult = () => {
  const { searchResult } = useSelector((store: RootState) => store.general)

  useEffect(() => {
    console.log(searchResult)
  }, [searchResult])

  return <div className='p-4'>SearchResult</div>
}

export default SearchResult
