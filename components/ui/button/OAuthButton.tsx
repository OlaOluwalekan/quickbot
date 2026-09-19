import { OAuthBtnProps } from '@/types'

const OAuthButton = ({ icon, text, onClick }: OAuthBtnProps) => {
  return (
    <button
      type='button'
      className='flex justify-center items-center gap-2 w-full py-2 border-[1px] border-dove-grey dark:border-medium-grey rounded-lg cursor-pointer text-sm hover:bg-light-grey dark:hover:bg-eerie-black'
      onClick={onClick}
    >
      {icon} <span>{text}</span>
    </button>
  )
}

export default OAuthButton
