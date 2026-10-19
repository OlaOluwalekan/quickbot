"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { FaBarsStaggered } from "react-icons/fa6";
import { useDispatch } from "react-redux";
import Search from "./Search";
import LocaleSwitcher from "../general/LocaleSwitcher";

const ChatMobileHeader = ({ userId }: { userId: string }) => {
  const dispatch = useDispatch();

  return (
    <header className="md:hidden border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-2.5 shrink-0 z-20">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Open navigation"
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
          onClick={() => dispatch(toggleMobileNavOpen(true))}
        >
          <FaBarsStaggered />
        </button>

        <div className="flex-1 min-w-0">
          <Search userId={userId} />
        </div>

        <LocaleSwitcher compact />
      </div>
    </header>
  );
};

export default ChatMobileHeader;
