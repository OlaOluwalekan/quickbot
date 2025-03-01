import { ReactNode } from 'react'

const AuthWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <div className='flex justify-center items-center min-h-screen bg-[url("/auth-bg-1.jpg")] bg-cover object-cover relative'>
      <div className='w-full h-full bg-black/5 absolute top-0 left-0'></div>
      <div className='w-full flex justify-center items-center z-20'>
        {children}
      </div>
    </div>
  )
}

export default AuthWrapper
