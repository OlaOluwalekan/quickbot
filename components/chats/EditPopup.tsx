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
import { Pencil } from "lucide-react";
import { ChangeEvent, FormEvent, MouseEvent, useState, useTransition } from "react";
import BasicButton from "../ui/button/BasicButton";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
        const res = await fetch(`/api/v1/workspaces/${dialogData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: chatTitle.trim() }),
        });
        const json = await res.json();
        if (res.ok && json.data) {
          toast.success(t("renameSuccess"));
          dispatch(setEditPopUpOpen(false));
          const newTitle = json.data.title || json.data.updatedChat?.title || chatTitle.trim();
          if (currentPageId === dialogData.id) {
            dispatch(setCurrentPageTitle(newTitle));
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
        className="w-[92%] max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg space-y-4"
      >
        <div className="flex items-center gap-3 text-accent">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
            <Pencil className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-fg">
            {t("renameChat")}
          </h3>
        </div>

        <InputWithIcon
          type="text"
          icons={<Pencil className="h-4 w-4" strokeWidth={1.5} />}
          name="chatTitle"
          value={chatTitle}
          placeholder={t("renamePlaceholder")}
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
            disabled={isPending || !chatTitle.trim()}
          />
        </div>
      </form>
    </PopupOverlay>
  );
};

export default EditPopup;
