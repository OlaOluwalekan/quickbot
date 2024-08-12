"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { RootState } from "@/store";
import clsx from "clsx";
import Link from "next/link";
import { MouseEvent } from "react";
import { BiSolidMessageSquareAdd } from "react-icons/bi";
import { FaBarsStaggered } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import ChatList from "./ChatList";
import UserProfile from "./user-profile/UserProfile";
import { ChatProps } from "@/types/chats";

const Sidebar = ({ data, chats }: { data: any; chats: ChatProps[] }) => {
  const { mobileNavIsOpen } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  return (
    <div
      className={clsx(
        "w-screen h-screen bg-primary/50 fixed top-0 transition-all md:static md:w-[300px] z-10",
        mobileNavIsOpen ? "left-0" : "left-[-5000px]"
      )}
      onClick={() => dispatch(toggleMobileNavOpen(false))}
    >
      <div
        className="w-[300px] bg-primary h-full shadow-xl md:shadow-none"
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
      >
        <section className="px-3 py-2 flex justify-between items-center">
          <button
            className="text-primary-content text-lg md:hidden"
            onClick={() => dispatch(toggleMobileNavOpen(false))}
          >
            <FaBarsStaggered />
          </button>

          <Link
            href="/chat"
            className="flex gap-2 items-center text-primary-content hover:bg-accent p-2 rounded"
          >
            New Chat <BiSolidMessageSquareAdd />
          </Link>
        </section>
        <div className="divider my-0"></div>
        <div className="h-[calc(100%-75px)] flex flex-col">
          <ChatList chats={chats} />
          <UserProfile data={data} />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
