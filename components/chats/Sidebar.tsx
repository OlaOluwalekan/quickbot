"use client";

import {
  toggleChatMenuOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import clsx from "clsx";
import Link from "next/link";
import { MouseEvent, useEffect } from "react";
import { BiSolidMessageSquareAdd } from "react-icons/bi";
import { FaXmark } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import ChatList from "./ChatList";
import UserProfile from "./user-profile/UserProfile";
import { ChatProps } from "@/types/chats";
import ChatMenu from "./ChatMenu";
import EditPopup from "./EditPopup";
import DeletePopup from "./DeletePopup";
import Logo from "../logo/Logo";
import AppName from "../logo/AppName";
import { useTranslations } from "next-intl";

const Sidebar = ({
  data,
  chats,
  dates,
}: {
  data: any;
  chats: ChatProps[];
  dates: string[];
}) => {
  const t = useTranslations("Chat");
  const {
    mobileNavIsOpen,
    chatMenuIsOpen,
    editPopUpIsOpen,
    deletePopUpIsOpen,
  } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  const grouped: Record<string, ChatProps[]> = chats.reduce(
    (acc: Record<string, ChatProps[]>, chat) => {
      const dateKey = (
        chat.updatedAt instanceof Date
          ? chat.updatedAt
          : new Date(chat.updatedAt)
      )
        .toISOString()
        .split("T")[0] ?? "Unknown";
      const group = acc[dateKey] ?? [];


      group.push(chat);
      acc[dateKey] = group;
      return acc;
    },
    {}
  );

  useEffect(() => {
    if (!mobileNavIsOpen) {
      dispatch(toggleChatMenuOpen(false));
    }
  }, [mobileNavIsOpen, dispatch]);

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 transition-opacity md:hidden",
          mobileNavIsOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={() => dispatch(toggleMobileNavOpen(false))}
      />

      {/* Sidebar Panel */}
      <aside
        className={clsx(
          "fixed md:static top-0 bottom-0 left-0 z-40 w-[280px] shrink-0 bg-slate-900 text-slate-100 border-r border-slate-800/90 flex flex-col transition-transform duration-300 ease-in-out",
          mobileNavIsOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        )}
        onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
      >
        {/* Brand Header & New Chat CTA */}
        <div className="p-3.5 flex flex-col gap-3 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2"
              onClick={() => dispatch(toggleMobileNavOpen(false))}
            >
              <Logo size="icon" />
              <AppName />
            </Link>
            <button
              type="button"
              aria-label="Close sidebar"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 md:hidden cursor-pointer"
              onClick={() => dispatch(toggleMobileNavOpen(false))}
            >
              <FaXmark />
            </button>
          </div>

          <Link
            href="/chat"
            onClick={() => dispatch(toggleMobileNavOpen(false))}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 text-white text-sm font-semibold shadow-md shadow-indigo-500/20 hover:opacity-95 transition-all"
          >
            <BiSolidMessageSquareAdd className="text-base" />
            <span>{t("newChat")}</span>
          </Link>
        </div>

        {/* Scrollable Chat History + Footer Profile */}
        <div className="flex-1 min-h-0 flex flex-col justify-between relative pt-2">
          <ChatList chats={chats} dates={dates} grouped={grouped} />
          {chatMenuIsOpen && <ChatMenu />}
          {editPopUpIsOpen && <EditPopup />}
          {deletePopUpIsOpen && <DeletePopup />}
          <UserProfile data={data} />
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
