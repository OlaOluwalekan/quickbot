"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { Menu } from "lucide-react";
import { useDispatch } from "react-redux";
import Search from "./Search";
import LocaleSwitcher from "../general/LocaleSwitcher";

const ChatMobileHeader = ({ userId }: { userId: string }) => {
  const dispatch = useDispatch();

  return (
    <header className="md:hidden border-b border-border bg-surface/90 backdrop-blur-md px-3 py-2.5 shrink-0 z-20">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Open navigation"
          className="p-2 rounded-xl border border-border text-fg hover:bg-surface-2 cursor-pointer shrink-0"
          onClick={() => dispatch(toggleMobileNavOpen(true))}
        >
          <Menu className="h-4 w-4" strokeWidth={1.5} />
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
