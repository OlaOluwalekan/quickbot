"use client";

import { RootState } from "@/store";
import { useSelector } from "react-redux";

const ChatDesktopHeader = () => {
  const { currentPageTitle } = useSelector((store: RootState) => store.general);

  return (
    <header className="bg-primary text-primary-content hidden md:flex">
      <div className="w-[90%] mx-auto flex justify-between items-center py-3">
        <div className="flex gap-3">
          <h2 className="text-xl">{currentPageTitle}</h2>
        </div>
      </div>
    </header>
  );
};

export default ChatDesktopHeader;
