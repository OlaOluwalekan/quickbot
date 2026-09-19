import { LinkBtnProps } from '@/types'
import clsx from 'clsx'
import Link from 'next/link'

const LinkButton = ({ text, className, href, children }: LinkBtnProps) => {
  const defaultClass = 'w-full py-2 px-4 rounded text-center'

  return (
    <Link href={href} className={clsx(defaultClass, className)}>
      {children || text}
    </Link>
  )
}

export default LinkButton
