'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'

interface TypingEffectProps {
  texts: string[]
  typingSpeed?: number
  backspaceSpeed?: number
  pauseDuration?: number
  className?: string
  cursorStyleClass?: string
}

const TypingText = ({
  texts,
  typingSpeed = 100,
  backspaceSpeed = 50,
  pauseDuration = 3000,
  className,
  cursorStyleClass,
}: TypingEffectProps) => {
  const [displayedText, setDisplayedText] = useState<string>('')
  const [cursorVisible, setCursorVisible] = useState<boolean>(true)
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isTyping, setIsTyping] = useState<boolean>(true)

  useEffect(() => {
    let intervalId: NodeJS.Timeout

    if (isTyping) {
      const currentText = texts[currentIndex] ?? ""
      let index = displayedText.length

      intervalId = setInterval(() => {
        if (index < currentText.length) {
          const nextChar = currentText.charAt(index)
          setDisplayedText((prev) => prev + nextChar)
          index++
        } else {
          clearInterval(intervalId)
          setTimeout(() => setIsTyping(false), pauseDuration)
        }
      }, typingSpeed)
    } else {
      let index = displayedText.length

      intervalId = setInterval(() => {
        if (index > 0) {
          setDisplayedText((prev) => prev.slice(0, -1))
          index--
        } else {
          clearInterval(intervalId)
          setCurrentIndex((prevIndex) => (prevIndex + 1) % texts.length)
          setIsTyping(true)
        }
      }, backspaceSpeed)
    }

    return () => clearInterval(intervalId)
  }, [
    isTyping,
    currentIndex,
    displayedText,
    texts,
    typingSpeed,
    backspaceSpeed,
    pauseDuration,
  ])

  useEffect(() => {
    const cursorIntervalId = setInterval(() => {
      setCursorVisible((prev) => !prev)
    }, 500)

    return () => clearInterval(cursorIntervalId)
  }, [])

  return (
    <h2 className={clsx(className)}>
      {displayedText}
      <span
        className={clsx(
          cursorStyleClass,
          cursorVisible ? 'opacity-50' : 'opacity-0'
        )}
      >
        |
      </span>
    </h2>
  )
}

export default TypingText
