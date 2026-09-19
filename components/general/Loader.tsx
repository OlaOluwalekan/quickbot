'use client'

import Image from 'next/image'
import { ReactNode, useEffect, useState } from 'react'
import FullLoader from '../loading/FullLoader'

const Loader = ({ children }: { children: ReactNode }) => {
  // start “not ready” so we can show a loader
  const [ready, setReady] = useState(false)

  // once React has mounted, flip to ready
  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready) {
    return <FullLoader />
  }

  return <div>{children}</div>
}

export default Loader
