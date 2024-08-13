"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { ChatProps } from "@/types/chats";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { FaEllipsisV } from "react-icons/fa";
import { useDispatch } from "react-redux";

const Chat = ({ chat }: { chat: ChatProps }) => {
  const dispatch = useDispatch();
  //   console.log(window.location.pathname);

  return (
    <div className="w-full">
      <div
        className={clsx(
          "w-full flex items-center gap-2 px-2 text-primary-content hover:bg-accent"
          // window.location.pathname.split("/").pop() === chat.id
          //   ? "bg-accent"
          //   : ""
        )}
      >
        <Link
          href={`/chat/${chat.id}`}
          className="w-[90%] flex text-nowrap overflow-x-scroll text-ellipsis scrollbar-none leading-10"
          onClick={() => dispatch(toggleMobileNavOpen(false))}
        >
          {chat.title}
        </Link>
        <button>
          <FaEllipsisV />
        </button>
      </div>
    </div>
  );
};

export default Chat;
