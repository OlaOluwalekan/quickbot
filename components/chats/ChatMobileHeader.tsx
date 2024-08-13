"use client";

import { toggleMobileNavOpen } from "@/features/generalSlice";
import { RootState } from "@/store";
import { FaBarsStaggered } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";

const ChatMobileHeader = () => {
  const dispatch = useDispatch();
  const { currentPageTitle } = useSelector((store: RootState) => store.general);

  return (
    <header className="bg-primary text-primary-content md:hidden">
      <div className="w-[90%] mx-auto flex justify-between items-center py-3">
        <div className="w-full flex gap-3">
          <button
            className="text-lg"
            onClick={() => dispatch(toggleMobileNavOpen(true))}
          >
            <FaBarsStaggered />
          </button>
          <h2 className="w-full text-xl text-nowrap overflow-auto scrollbar-none">
            {currentPageTitle}
          </h2>
        </div>
      </div>
    </header>
  );
};

export default ChatMobileHeader;
