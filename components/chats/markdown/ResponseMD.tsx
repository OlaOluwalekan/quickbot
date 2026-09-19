'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Children, ReactNode, useEffect } from 'react'
import CustomCode from './CustomCode'
import InlineCode from './InlineCode'
import CustomOl from './CustomOl'
import { convertToHTML } from '@/utils/markdown'
import CustomUl from './CustomUl'
import CustomLi from './CustomLi'
import CustomLink from './CustomLink'
import { useSearchParams } from 'next/navigation'
import highlightText from './highlightText'

interface CodeProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
}

const ResponseMD = ({ response }: { response: string }) => {
  const searchParams = useSearchParams()
  const searchQuery = searchParams.get('q')?.trim().toLowerCase() || ''

  useEffect(() => {
    convertToHTML(response)
  }, [])

  return (
    <ReactMarkdown
      className='w-full overflow-hidden'
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
            <CustomCode
              language={language}
              children={children}
              props={props}
              search={searchQuery}
            />
          ) : (
            <InlineCode
              children={children}
              props={props}
              search={searchQuery}
            />
          )
        },
        ul({ children, ...props }) {
          return <CustomUl children={children} {...props} />
        },
        ol({ children, ...props }) {
          return <CustomOl children={children} {...props} />
        },
        li({ children, ...props }) {
          return (
            <CustomLi {...props}>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </CustomLi>
          )
        },
        p({ children, ...props }) {
          return (
            <p {...props} className='text-sm'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </p>
          )
        },
        strong({ children, ...props }) {
          return (
            <span {...props} className='text-sm font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </span>
          )
        },
        a({ href, children, ...props }) {
          return (
            <CustomLink href={href as string} {...props}>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </CustomLink>
          )
        },
        h1({ children, ...props }) {
          return (
            <h1 className='text-4xl font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </h1>
          )
        },
        h2({ children, ...props }) {
          return (
            <h2 className='text-3xl font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </h2>
          )
        },
        h3({ children, ...props }) {
          return (
            <h3 className='text-2xl font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </h3>
          )
        },
        h4({ children, ...props }) {
          return (
            <h4 className='text-xl font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </h4>
          )
        },
        h5({ children, ...props }) {
          return (
            <h5 className='text-lg font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </h5>
          )
        },
        h6({ children, ...props }) {
          return (
            <h6 className='text-base font-semibold'>
              {Children.map(children, (child) => {
                return typeof child === 'string'
                  ? highlightText(child, searchQuery)
                  : child
              })}
            </h6>
          )
        },
      }}
    >
      {response}
    </ReactMarkdown>
  )
}

export default ResponseMD
