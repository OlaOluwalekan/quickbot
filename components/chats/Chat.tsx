"use client";

import {
  setChatMenuClass,
  setDialogData,
  toggleChatMenuOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import { ChatProps } from "@/types/chats";
import clsx from "clsx";
import Link from "next/link";
import { MouseEvent, useEffect } from "react";
import { FaEllipsisV } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";

const chat1 = {
  id: "id1",
  title: "title1",
  createdBy: "createdBy1",
  createdAt: "createdAt1",
  updatedAt: "UpdatedAt1",
};

const Chat = ({ chat }: { chat: ChatProps }) => {
  const dispatch = useDispatch();
  const { currentPageId, chatMenuIsOpen, chatMenuClass, dialogData } =
    useSelector((store: RootState) => store.general);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // console.log(e.currentTarget.className.includes(`a-modal`));
    if (
      e.currentTarget.className.includes(`a-modal`) &&
      dialogData?.id !== chat.id
    ) {
      dispatch(toggleChatMenuOpen(true));
    } else {
      dispatch(toggleChatMenuOpen(!chatMenuIsOpen));
    }
    dispatch(setDialogData(chat));
    const target = e.currentTarget.getBoundingClientRect();
    dispatch(setChatMenuClass(`${target.top - 50}px`));
  };

  // useEffect(() => {
  //   if (chatMenuIsOpen) {
  //     dispatch(setDialogData(chat));
  //   } else {
  //     dispatch(setDialogData(null));
  //   }
  // }, [chatMenuIsOpen]);

  // useEffect(() => {
  //   console.log(dialogData);
  // }, [dialogData]);

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
        <button onClick={handleClick} className={clsx("a-modal", chat.id)}>
          <FaEllipsisV />
        </button>
      </div>
    </div>
  );
};

export default Chat;
