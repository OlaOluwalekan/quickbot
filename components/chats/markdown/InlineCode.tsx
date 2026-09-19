import { ReactNode } from 'react'
import highlightText from './highlightText'

const InlineCode = ({
  children,
  props,
  search,
}: {
  children: ReactNode
  props: any
  search?: string
}) => {
  const rawText = String(children)

  return (
    <code {...props} className='rounded bg-platinum/20 px-1 py-0.5'>
      {highlightText(rawText, search as string)}
    </code>
  )
}

export default InlineCode
