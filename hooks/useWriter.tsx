'use client'

import { useEffect, useState } from 'react'

const useWriter = (
  text: string,
  speed: number = 50,
  resetDelay: number = 2000
) => {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    if (index < text.length) {
      // still typing…
      timer = setTimeout(() => {
        setIndex((i) => i + 1)
      }, speed)
    } else {
      // done typing → wait, then reset
      timer = setTimeout(() => {
        setIndex(0)
      }, resetDelay)
    }

    return () => clearTimeout(timer)
  }, [index, text, speed, resetDelay])

  return text.slice(0, index)
}

export default useWriter
