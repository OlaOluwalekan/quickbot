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
import { ChangeEvent, MouseEvent, useState, useTransition } from "react";
import BasicButton from "../ui/button/BasicButton";
import { updateChatTitle } from "@/utils/actions/chat";

const EditPopup = () => {
  const dispatch = useDispatch();
  const { dialogData, currentPageId } = useSelector(
    (store: RootState) => store.general
  );
  const [chatTitle, setChatTitle] = useState(dialogData?.title);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(() => {
      updateChatTitle(dialogData?.id as string, chatTitle as string).then(
        (res) => {
          if (res.success) {
            dispatch(setEditPopUpOpen(false));
            if (currentPageId === dialogData?.id) {
              dispatch(setCurrentPageTitle(res.data.updatedChat.title));
            }
            dispatch(toggleMobileNavOpen(false));
          }
        }
      );
    });
  };

  return (
    <PopupOverlay onClick={() => dispatch(setEditPopUpOpen(false))}>
      <form
        action={handleSubmit}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="w-[90%] max-w-[600px] bg-base-100 px-3 py-5 rounded-md shadow-lg"
      >
        <h3 className="text-base-content text-center font-semibold">
          Edit Chat Title
        </h3>
        <InputWithIcon
          type="text"
          placeholder="Chat Title"
          icons={<FaEdit />}
          name="chatTitle"
          value={chatTitle}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setChatTitle(e.target.value)
          }
        />
        <BasicButton
          type="submit"
          text={isPending ? "Updating..." : "Update"}
          size="full"
          theme="primary"
          disabled={!chatTitle || isPending}
        />
      </form>
    </PopupOverlay>
  );
};

export default EditPopup;
