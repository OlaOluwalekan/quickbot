"use client";

import { useUiStore } from "@/lib/stores/ui";
import Search from "./Search";
import LocaleSwitcher from "../general/LocaleSwitcher";

const ChatDesktopHeader = ({ userId }: { userId: string }) => {
  const currentPageTitle = useUiStore((s) => s.currentPageTitle);

  return (
    <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-surface/80 backdrop-blur-md shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <h2 className="text-base font-bold text-fg truncate max-w-md">
          {currentPageTitle}
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <Search userId={userId} />
        <LocaleSwitcher />
      </div>
    </header>
  );
};

export default ChatDesktopHeader;
