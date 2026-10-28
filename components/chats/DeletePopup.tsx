"use client";

import { useDispatch, useSelector } from "react-redux";
import PopupOverlay from "./PopupOverlay";
import { RootState } from "@/store";
import {
  setDeletePopUpOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { FormEvent, MouseEvent, useTransition } from "react";
import { useRouter } from "next/navigation";
import BasicButton from "../ui/button/BasicButton";
import { FaExclamationTriangle } from "react-icons/fa";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";

const DeletePopup = () => {
  const t = useTranslations("Chat");
  const tCommon = useTranslations("Common");
  const dispatch = useDispatch();
  const { dialogData, currentPageId } = useSelector(
    (store: RootState) => store.general
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dialogData?.id) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${dialogData.id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          toast.success(t("deleteSuccess"));
          dispatch(setDeletePopUpOpen(false));
          dispatch(toggleMobileNavOpen(false));
          if (currentPageId === dialogData.id) {
            router.push("/workspaces");
          }
          router.refresh();
        } else {
          toast.error(t("deleteError"));
        }
      } catch {
        toast.error(t("deleteError"));
      }
    });
  };

  return (
    <PopupOverlay onClick={() => dispatch(setDeletePopUpOpen(false))}>
      <form
        onSubmit={handleSubmit}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="w-[92%] max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center gap-3 text-rose-500">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
            <FaExclamationTriangle className="text-lg" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("deleteConfirmTitle")}
          </h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t("deleteConfirmDescription", { title: dialogData?.title || "" })}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <BasicButton
            type="button"
            text={tCommon("cancel")}
            size="small"
            theme="outline"
            onClick={() => dispatch(setDeletePopUpOpen(false))}
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            {isPending ? tCommon("loading") : t("confirmDelete")}
          </button>
        </div>
      </form>
    </PopupOverlay>
  );
};

export default DeletePopup;
