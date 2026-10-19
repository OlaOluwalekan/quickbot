"use client";

import {
  setDeletePopUpOpen,
  setEditPopUpOpen,
  toggleChatMenuOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import { FaPen, FaTrash } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import { useTranslations } from "next-intl";

const ChatMenu = () => {
  const t = useTranslations("Common");
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
      className="w-40 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl p-1.5 absolute right-3 z-50"
      style={{
        top: chatMenuClass,
      }}
    >
      <button
        type="button"
        onClick={handleEditClicked}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <FaPen className="text-indigo-400" />
        <span>{t("edit")}</span>
      </button>
      <button
        type="button"
        onClick={handleDeleteClicked}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
      >
        <FaTrash />
        <span>{t("delete")}</span>
      </button>
    </div>
  );
};

export default ChatMenu;
