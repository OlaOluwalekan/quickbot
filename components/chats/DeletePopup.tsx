import { useDispatch, useSelector } from "react-redux";
import PopupOverlay from "./PopupOverlay";
import { RootState } from "@/store";
import {
  setDeletePopUpOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { ChangeEvent, MouseEvent, useTransition } from "react";
import { deleteChat } from "@/utils/actions/chat";
import { useRouter } from "next/navigation";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import BasicButton from "../ui/button/BasicButton";
import { FaExclamationTriangle } from "react-icons/fa";

const DeletePopup = () => {
  const dispatch = useDispatch();
  const { dialogData, currentPageId } = useSelector(
    (store: RootState) => store.general
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = () => {
    startTransition(() => {
      deleteChat(dialogData?.id as string).then((res) => {
        if (res.success) {
          dispatch(setDeletePopUpOpen(false));
          if (currentPageId === dialogData?.id) {
            router.push("/chat");
          }
          dispatch(toggleMobileNavOpen(false));
        }
      });
    });
  };

  return (
    <PopupOverlay onClick={() => dispatch(setDeletePopUpOpen(false))}>
      <form
        action={handleSubmit}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="w-[90%] max-w-[600px] bg-base-100 px-3 py-5 rounded-md shadow-lg"
      >
        <h3 className="text-center font-semibold text-error">
          Are you sure you want to delete this chat? -{" "}
          <span className="text-base-content">{dialogData?.title}</span>
        </h3>
        <p className="flex justify-center items-center gap-2 text-sm my-5 text-error">
          <FaExclamationTriangle /> This action cannot be reversed
        </p>
        <InputWithIcon
          type="hidden"
          icons={null}
          name="chatTitle"
          value={dialogData?.id}
          onChange={(e: ChangeEvent<HTMLInputElement>) => null}
        />
        <BasicButton
          type="submit"
          text={isPending ? "Deleting..." : "Delete"}
          size="full"
          theme="primary"
          disabled={isPending}
        />
      </form>
    </PopupOverlay>
  );
};

export default DeletePopup;
