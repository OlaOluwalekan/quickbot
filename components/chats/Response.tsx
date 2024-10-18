"use client";

import { ResponseProps } from "@/types/chats";
import React, { useState } from "react";
import UserImage from "./UserImage";
import { format } from "date-fns";
import { FaCopy, FaRegCircleStop, FaRobot } from "react-icons/fa6";
import { HiMiniSpeakerWave } from "react-icons/hi2";
import ResponseMD from "./markdown/ResponseMD";
import clsx from "clsx";
import { MdLibraryAddCheck } from "react-icons/md";
import { handleStop, readAloud } from "@/utils/speak";
import { marked } from "marked";
import TypingText from "../ui/text/TypingText";

const Response = ({
  response,
  image,
}: {
  response: ResponseProps;
  image: string | null;
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [ResponseIsCopied, setResponseIsCopied] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);

  const parseMarkdownToText = (markdown: string) => {
    const html = marked(markdown);
    const doc = new DOMParser().parseFromString(html as string, "text/html");
    return doc.body.textContent || "";
  };

  const handleCopyQuestion = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  const handleCopyResponse = (text: string) => {
    navigator.clipboard.writeText(text);
    setResponseIsCopied(true);
    setTimeout(() => {
      setResponseIsCopied(false);
    }, 3000);
  };

  const handleReadClicked = () => {
    const text = parseMarkdownToText(response.response);

    if (isReadingAloud) {
      handleStop(setIsReadingAloud);
    } else {
      readAloud(text, setIsReadingAloud);
    }
  };

  return (
    <div>
      <div className="chat chat-end">
        <div className="chat-image avatar">
          <UserImage image={image} />
        </div>
        <div className="chat-header">
          You
          <time className="text-xs opacity-50 ml-2">
            {format(response.createdAt, "MMM dd, yyyy HH:mm a")}
          </time>
        </div>
        <div className="chat-bubble chat-bubble-primary">
          {response.question}
        </div>
        <div className="chat-footer opacity-50 mt-1 text-base">
          <button
            className={clsx(
              "hover:text-accent",
              isCopied ? "text-success" : "text-base-content"
            )}
            onClick={() => handleCopyQuestion(response.question)}
          >
            {isCopied ? <MdLibraryAddCheck /> : <FaCopy />}
          </button>
        </div>
      </div>

      <div className="chat chat-start small:w-full small:relative">
        <div className="chat-image avatar small:absolute small:bottom-[5px]">
          <div className="w-10 small:w-7 rounded-full flex justify-center items-center">
            <FaRobot className="text-4xl small:text-2xl" />
          </div>
        </div>
        <div className="chat-header">
          Quickbot
          <time className="text-xs opacity-50 ml-2">
            {format(response.createdAt, "MMM dd, yyyy HH:mm a")}
          </time>
        </div>
        <div className="markdown chat-bubble bg-base-100 text-base-content w-[90%] whitespace-pre-wrap break-words">
          <ResponseMD response={response.response} />
        </div>
        <div className="chat-footer opacity-50 border-t-2 border-primary py-2 px-2 text-base flex gap-2 small:ml-5">
          <button
            className={clsx(
              "hover:text-accent",
              ResponseIsCopied ? "text-success" : "text-base-content"
            )}
            onClick={() => handleCopyResponse(response.response)}
          >
            {ResponseIsCopied ? <MdLibraryAddCheck /> : <FaCopy />}
          </button>
          <button
            className={clsx(
              "hover:text-accent",
              isReadingAloud ? "text-error" : "text-base-content"
            )}
            onClick={handleReadClicked}
          >
            {isReadingAloud ? <FaRegCircleStop /> : <HiMiniSpeakerWave />}
          </button>
        </div>
      </div>
      <div className="divider my-2"></div>
    </div>
  );
};

export default Response;
