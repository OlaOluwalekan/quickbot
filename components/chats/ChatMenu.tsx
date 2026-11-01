"use client";

import {
  setDeletePopUpOpen,
  setEditPopUpOpen,
  toggleChatMenuOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import { Pencil, Trash2 } from "lucide-react";
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
      className="w-40 rounded-xl border border-border bg-surface text-fg shadow-lg p-1.5 absolute right-3 z-50"
      style={{
        top: chatMenuClass,
      }}
    >
      <button
        type="button"
        onClick={handleEditClicked}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-fg hover:bg-surface-2 transition-colors cursor-pointer"
      >
        <Pencil className="h-3.5 w-3.5 text-accent" strokeWidth={1.5} />
        <span>{t("edit")}</span>
      </button>
      <button
        type="button"
        onClick={handleDeleteClicked}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-danger hover:bg-danger/10 transition-colors cursor-pointer"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span>{t("delete")}</span>
      </button>
    </div>
  );
};

export default ChatMenu;
