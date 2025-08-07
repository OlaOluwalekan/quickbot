import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { darcula } from 'react-syntax-highlighter/dist/esm/styles/prism'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import { setCodeTheme } from '@/features/generalSlice'
import { IoMdCheckmarkCircleOutline } from 'react-icons/io'
import { AiOutlineCopy } from 'react-icons/ai'

const highlightSearchInCode = (code: string, search: string): string => {
  if (!search) return code
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return code.replace(
    regex,
    '<mark style="background-color: yellow;">$1</mark>'
  )
}

const CustomCode = ({
  language,
  children,
  props,
  search,
}: {
  language: string
  children: ReactNode
  props: any
  search?: string
}) => {
  const [isCopied, setIsCopied] = useState(false)
  const { codeTheme } = useSelector((store: RootState) => store.general)
  const dispatch = useDispatch()

  const toggleCodeTheme = () => {
    dispatch(setCodeTheme(codeTheme === 'light' ? 'dark' : 'light'))
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setIsCopied(true)
    setTimeout(() => {
      setIsCopied(false)
    }, 3000)
  }

  const rawCode = String(children).replace(/\n$/, '')
  const highlightedCode = search
    ? highlightSearchInCode(rawCode, search)
    : rawCode

  return (
    <div className='text-sm flex flex-col bg-eerie-black rounded-lg'>
      <section className='flex justify-between items-center px-3 text-white-main'>
        <span>{language}</span>
        <button
          className={clsx(
            'cursor-pointer px-2 aspect-square rounded-full hover:bg-teal-green/40 hover:text-teal-green',
            isCopied ? 'text-success' : 'text-base'
          )}
          onClick={() => handleCopyCode(children as string)}
        >
          {isCopied ? <IoMdCheckmarkCircleOutline /> : <AiOutlineCopy />}
        </button>
        {/* </article> */}
      </section>

      <SyntaxHighlighter
        {...props}
        PreTag='div'
        language={language}
        style={darcula}
        children={highlightedCode}
        wrapLines={true}
        useInlineStyles={true}
      />
      {/* {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter> */}
    </div>
  )
}

export default CustomCode
