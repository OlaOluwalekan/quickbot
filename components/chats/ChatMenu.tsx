"use client";

import {
  setDeletePopUpOpen,
  setEditPopUpOpen,
  toggleChatMenuOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import clsx from "clsx";
import { useEffect } from "react";
import { FaPenAlt } from "react-icons/fa";
import { FaTrash } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";

const ChatMenu = () => {
  const { chatMenuClass } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();

  const handleEditClicked = () => {
    dispatch(setEditPopUpOpen(true));
    dispatch(toggleChatMenuOpen(false));
  };

  const handleDeleteClicked = () => {
    dispatch(setDeletePopUpOpen(true));
    dispatch(toggleChatMenuOpen(false));
  };

  return (
    <div
      className={clsx(
        "w-36 bg-accent text-accent-content rounded absolute right-[-130px]",
        chatMenuClass
      )}
      style={{
        top: chatMenuClass,
      }}
    >
      <ul className="menu rounded-box">
        <li>
          <button onClick={handleEditClicked}>
            <FaPenAlt />
            Rename
          </button>
        </li>
        <li>
          <button onClick={handleDeleteClicked}>
            <FaTrash />
            Delete
          </button>
        </li>
      </ul>
    </div>
  );
};

export default ChatMenu;
