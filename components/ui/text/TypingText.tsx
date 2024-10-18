"use client";

import { useEffect, useState } from "react";
import { Irish_Grover, Inter } from "next/font/google";
import clsx from "clsx";

interface TypingEffectProps {
  texts: string[];
  typingSpeed?: number; // Optional, default typing speed in milliseconds.
  backspaceSpeed?: number; // Speed for deleting each character
  pauseDuration?: number; // Pause between typing and backspacing (in ms)
  mainStyleClass?: string;
  cursorStyleClass?: string;
}

const TypingText = ({
  texts,
  typingSpeed = 100,
  backspaceSpeed = 50,
  pauseDuration = 3000,
  mainStyleClass,
  cursorStyleClass,
}: TypingEffectProps) => {
  const [displayedText, setDisplayedText] = useState<string>("");
  const [cursorVisible, setCursorVisible] = useState<boolean>(true);
  const [currentIndex, setCurrentIndex] = useState<number>(0); // Track current string
  const [isTyping, setIsTyping] = useState<boolean>(true); // Track whether we're typing or backspacing

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isTyping) {
      // Typing effect
      const currentText = texts[currentIndex];
      let index = displayedText.length;

      intervalId = setInterval(() => {
        if (index < currentText.length) {
          const nextChar = currentText.charAt(index);
          setDisplayedText((prev) => prev + nextChar);
          index++;
        } else {
          clearInterval(intervalId); // Stop when the word is fully typed
          setTimeout(() => setIsTyping(false), pauseDuration); // Pause before backspacing
        }
      }, typingSpeed);
    } else {
      // Backspacing effect
      let index = displayedText.length;

      intervalId = setInterval(() => {
        if (index > 0) {
          setDisplayedText((prev) => prev.slice(0, -1));
          index--;
        } else {
          clearInterval(intervalId); // Stop when the word is fully erased
          setCurrentIndex((prevIndex) => (prevIndex + 1) % texts.length); // Move to next text
          setIsTyping(true); // Start typing the next text
        }
      }, backspaceSpeed);
    }

    return () => clearInterval(intervalId); // Cleanup interval on unmount
  }, [
    isTyping,
    currentIndex,
    displayedText,
    texts,
    typingSpeed,
    backspaceSpeed,
    pauseDuration,
  ]);

  useEffect(() => {
    // Cursor blinking effect
    const cursorIntervalId = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 500); // Toggle every 500ms

    return () => clearInterval(cursorIntervalId); // Cleanup interval on unmount
  }, []);

  return (
    <h2 className={clsx(mainStyleClass)}>
      {displayedText}
      <span
        className={clsx(
          cursorStyleClass,
          cursorVisible ? "opacity-50" : "opacity-0"
        )}
      >
        |
      </span>
    </h2>
  );
};

export default TypingText;

// return (
//   <h2 className={`font-semibold inline text-4xl ${irish.className}`}>
//     {displayedText}
//     <span
//       className={`inline text-3xl ${
//         cursorVisible ? "opacity-50" : "opacity-0"
//       } ${inter.className}`}
//     >
//       |
//     </span>
//   </h2>
// );
