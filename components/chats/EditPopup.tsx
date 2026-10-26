"use client";

import { useDispatch, useSelector } from "react-redux";
import PopupOverlay from "./PopupOverlay";
import {
  setCurrentPageTitle,
  setEditPopUpOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEdit } from "react-icons/fa";
import { ChangeEvent, FormEvent, MouseEvent, useState, useTransition } from "react";
import BasicButton from "../ui/button/BasicButton";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const EditPopup = () => {
  const t = useTranslations("Chat");
  const tCommon = useTranslations("Common");
  const dispatch = useDispatch();
  const router = useRouter();
  const { dialogData, currentPageId } = useSelector(
    (store: RootState) => store.general
  );
  const [chatTitle, setChatTitle] = useState(dialogData?.title || "");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dialogData?.id || !chatTitle.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/chats/${dialogData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: chatTitle.trim() }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success(t("renameSuccess"));
          dispatch(setEditPopUpOpen(false));
          if (currentPageId === dialogData.id) {
            dispatch(setCurrentPageTitle(json.data.updatedChat.title));
          }
          dispatch(toggleMobileNavOpen(false));
          router.refresh();
        } else {
          toast.error(t("renameError"));
        }
      } catch {
        toast.error(t("renameError"));
      }
    });
  };

  return (
    <PopupOverlay onClick={() => dispatch(setEditPopUpOpen(false))}>
      <form
        onSubmit={handleSubmit}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="w-[92%] max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"
      >
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {t("renameChat")}
        </h3>
        <InputWithIcon
          type="text"
          placeholder={t("renameChat")}
          icons={<FaEdit />}
          name="chatTitle"
          value={chatTitle}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setChatTitle(e.target.value)
          }
        />
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <BasicButton
            type="button"
            text={tCommon("cancel")}
            size="small"
            theme="outline"
            onClick={() => dispatch(setEditPopUpOpen(false))}
          />
          <BasicButton
            type="submit"
            text={isPending ? tCommon("loading") : tCommon("save")}
            size="small"
            theme="primary"
            disabled={!chatTitle.trim() || isPending}
          />
        </div>
      </form>
    </PopupOverlay>
  );
};

export default EditPopup;
