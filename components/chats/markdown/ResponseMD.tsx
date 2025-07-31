'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect } from 'react'
import CustomCode from './CustomCode'
import InlineCode from './InlineCode'
import CustomOl from './CustomOl'
import { convertToHTML } from '@/utils/markdown'
import CustomUl from './CustomUl'
import CustomLi from './CustomLi'
import CustomLink from './CustomLink'

interface CodeProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

const ResponseMD = ({ response }: { response: string }) => {
  useEffect(() => {
    convertToHTML(response)
  }, [])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }: CodeProps) {
          let match: any = /language-(\w+)/.exec(className || '')

          const isBlock = className
            ? true
            : String(children).includes('\n')
            ? true
            : false
          const language = match ? match[1] : 'shell'

          return isBlock ? (
            <CustomCode language={language} children={children} props={props} />
          ) : (
            <InlineCode children={children} props={props} />
          )
        },
        ul({ children, ...props }) {
          return <CustomUl children={children} {...props} />
        },
        ol({ children, ...props }) {
          return <CustomOl children={children} {...props} />
        },
        li({ children, ...props }) {
          return <CustomLi children={children} {...props} />
        },
        p({ children, ...props }) {
          return (
            <p {...props} className='my-1'>
              {children}
            </p>
          )
        },
        a({ href, children, ...props }) {
          return (
            <CustomLink href={href as string} children={children} {...props} />
          )
        },
        h1({ children, ...props }) {
          return <h1 className='text-4xl font-semibold'>{children}</h1>
        },
        h2({ children, ...props }) {
          return <h2 className='text-3xl font-semibold'>{children}</h2>
        },
        h3({ children, ...props }) {
          return <h3 className='text-2xl font-semibold'>{children}</h3>
        },
        h4({ children, ...props }) {
          return <h4 className='text-xl font-semibold'>{children}</h4>
        },
        h5({ children, ...props }) {
          return <h5 className='text-lg font-semibold'>{children}</h5>
        },
        h6({ children, ...props }) {
          return <h6 className='text-base font-semibold'>{children}</h6>
        },
      }}
    >
      {response}
    </ReactMarkdown>
  )
}

export default ResponseMD
