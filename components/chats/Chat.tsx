"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { RootState } from "@/store";
import { ChatProps } from "@/types/chats";
import clsx from "clsx";
import Link from "next/link";
import { FaEllipsisV } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";

const Chat = ({ chat }: { chat: ChatProps }) => {
  const dispatch = useDispatch();
  const { currentPageId } = useSelector((store: RootState) => store.general);

  return (
    <div className="w-full">
      <div
        className={clsx(
          "w-full flex items-center gap-2 px-2 text-primary-content hover:bg-accent",
          currentPageId === chat.id ? "bg-accent" : ""
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
