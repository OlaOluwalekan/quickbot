import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import {
  darcula,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism'
import { FaCopy, FaMoon, FaSun } from 'react-icons/fa6'
import { MdLibraryAddCheck } from 'react-icons/md'
import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/store'
import { setCodeTheme } from '@/features/generalSlice'

const CustomCode = ({
  language,
  children,
  props,
}: {
  language: string
  children: ReactNode
  props: any
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

  return (
    <div className='mockup-code text-sm bg-primary text-primary-content'>
      <section className='flex justify-between px-3'>
        <span className='block'>{language}</span>
        <article className='flex gap-4 items-center'>
          <button
            className='text-lg hover:text-base-200'
            onClick={toggleCodeTheme}
          >
            {codeTheme === 'light' ? <FaMoon /> : <FaSun />}
          </button>
          <button
            className={clsx(
              'text-lg hover:text-base-200',
              isCopied ? 'text-success' : 'text-base'
            )}
            onClick={() => handleCopyCode(children as string)}
          >
            {isCopied ? <MdLibraryAddCheck /> : <FaCopy />}
          </button>
        </article>
      </section>
      <SyntaxHighlighter
        {...props}
        PreTag='div'
        language={language}
        style={codeTheme === 'light' ? oneLight : darcula}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  )
}

export default CustomCode
