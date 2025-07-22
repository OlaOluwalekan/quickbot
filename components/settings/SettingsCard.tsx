import { ReactNode } from 'react'

const SettingsCard = ({ children }: { children: ReactNode }) => {
  return (
    <div className='rounded-xl w-[90%] max-w-[1200px] px-3 py-5 bg-base-200 dark:bg-dark-base-200 shadow-lg flex flex-col justify-center text-base-content dark:text-dark-base-content items-center'>
      {children}
    </div>
  )
}
export default SettingsCard
