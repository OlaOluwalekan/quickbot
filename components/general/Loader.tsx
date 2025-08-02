'use client'

import { ReactNode, useEffect, useState } from 'react'

const Loader = ({ children }: { children: ReactNode }) => {
  // start “not ready” so we can show a loader
  const [ready, setReady] = useState(false)

  // once React has mounted, flip to ready
  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready) {
    // Show whatever placeholder you like
    return (
      <div className='fixed inset-0 flex items-center justify-center bg-gray-50'>
        <span>Initializing…</span>
      </div>
    )
  }

  return <div>{children}</div>
}

export default Loader
