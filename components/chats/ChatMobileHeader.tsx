"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { FaBarsStaggered } from "react-icons/fa6";
import { useDispatch } from "react-redux";

const ChatMobileHeader = () => {
  const dispatch = useDispatch();

  return (
    <header className="bg-primary text-primary-content md:hidden">
      <div className="w-[90%] mx-auto flex justify-between items-center py-3">
        <div className="flex gap-3">
          <button
            className="text-lg"
            onClick={() => dispatch(toggleMobileNavOpen(true))}
          >
            <FaBarsStaggered />
          </button>
          <h2 className="text-xl">New Chat</h2>
        </div>
      </div>
    </header>
  );
};

export default ChatMobileHeader;
