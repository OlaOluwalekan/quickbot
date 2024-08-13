"use client";

import { ResponseProps } from "@/types/chats";
import React from "react";
import UserImage from "./UserImage";
import { format } from "date-fns";
import { FaRobot } from "react-icons/fa6";
import ResponseMD from "./markdown/ResponseMD";

const Response = ({
  response,
  image,
}: {
  response: ResponseProps;
  image: string | null;
}) => {
  return (
    <div>
      <div className="chat chat-end">
        <div className="chat-image avatar">
          <UserImage image={image} />
        </div>
        <div className="chat-header">
          You
          <time className="text-xs opacity-50 ml-2">
            {format(response.createdAt, "dd/mm/yyyy HH:mm a")}
          </time>
        </div>
        <div className="chat-bubble chat-bubble-primary">
          {response.question}
        </div>
        <div className="chat-footer opacity-50">Delivered</div>
      </div>

      <div className="chat chat-start">
        <div className="chat-image avatar">
          <div className="w-10 rounded-full flex justify-center items-center">
            <FaRobot className="text-4xl" />
          </div>
        </div>
        <div className="chat-header">
          Quickbot
          <time className="text-xs opacity-50 ml-2">
            {format(response.createdAt, "dd/mm/yyyy HH:mm a")}
          </time>
        </div>
        <div className="markdown chat-bubble bg-base-100 text-base-content w-[90%] whitespace-pre-wrap break-words">
          <ResponseMD response={response.response} />
        </div>
        <div className="chat-footer opacity-50">Seen at 12:46</div>
      </div>
      <div className="divider my-2"></div>
    </div>
  );
};

export default Response;
