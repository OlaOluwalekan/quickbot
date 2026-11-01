"use client";

import {
  toggleChatMenuOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import clsx from "clsx";
import Link from "next/link";
import { MouseEvent, useEffect } from "react";
import { MessageSquarePlus, X } from "lucide-react";
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
      const dateKey =
        (chat.updatedAt instanceof Date
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
          "fixed inset-0 z-30 bg-overlay backdrop-blur-xs transition-opacity md:hidden",
          mobileNavIsOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={() => dispatch(toggleMobileNavOpen(false))}
      />

      {/* Sidebar Panel */}
      <aside
        className={clsx(
          "fixed top-0 bottom-0 left-0 z-40 flex w-70 shrink-0 flex-col border-r border-border bg-surface text-fg transition-transform duration-300 ease-in-out md:static",
          mobileNavIsOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        )}
        onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
      >
        {/* Brand Header & New Chat CTA */}
        <div className="flex flex-col gap-3 border-b border-border p-3.5">
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
              className="cursor-pointer rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg md:hidden"
              onClick={() => dispatch(toggleMobileNavOpen(false))}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <Link
            href="/workspaces"
            onClick={() => dispatch(toggleMobileNavOpen(false))}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition-all hover:bg-accent-hover"
          >
            <MessageSquarePlus className="h-4 w-4" strokeWidth={1.5} />
            <span>{t("newChat")}</span>
          </Link>
        </div>

        {/* Scrollable Chat History + Footer Profile */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-between pt-2">
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
