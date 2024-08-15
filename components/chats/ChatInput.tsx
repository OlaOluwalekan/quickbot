"use client";

import {
  setAIResponse,
  setChatInputHeight,
  setLoadingResponse,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import { getResponseFromAI } from "@/utils/actions/response";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState, useTransition } from "react";
import { FaPaperPlane } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";

const ChatInput = ({
  userId,
  existingToken,
}: {
  userId: string;
  existingToken: number;
}) => {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dispatch = useDispatch();
  const [text, setText] = useState("");
  const { currentPageTitle } = useSelector((store: RootState) => store.general);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = "48px";
    }
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textRef.current) {
      textRef.current.style.height = "48px";
      textRef.current.style.height = `${textRef.current.scrollHeight}px`;
      if (textRef.current.scrollHeight > 48) {
        textRef.current.style.lineHeight = "20px";
      }

      let numHeight = parseInt(textRef.current.style.height);
      dispatch(
        setChatInputHeight(
          numHeight < 184 ? textRef.current.style.height : "195px"
        )
      );
    }
  };

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      dispatch(setLoadingResponse(true));
      getResponseFromAI(formData, window.location.pathname, existingToken).then(
        (res) => {
          if (res.success) {
            dispatch(setAIResponse(res.data.text));
            if (textRef.current) {
              textRef.current.value = "";
              textRef.current.style.height = "48px";
            }
          }
          if (res?.data.chatId && window.location.pathname === "/chat") {
            router.push(`/chat/${res.data.chatId}`);
          }
          dispatch(setLoadingResponse(false));
        }
      );
    });
  };

  return (
    <form
      className={clsx(
        "w-full my-3 absolute bottom-0 left-0 right-0 mx-auto",
        currentPageTitle === "" && "hidden"
      )}
      action={handleSubmit}
    >
      <input type="hidden" value={userId} id="id" name="id" />
      <textarea
        onChange={handleChange}
        ref={textRef}
        name="question"
        id="question"
        rows={1}
        placeholder="Ask Quick"
        className="w-full resize-none h-[48px] max-h-[200px] overflow-y-auto text-base py-3 pl-3 pr-8 rounded-lg bg-base-200 border-1 border-primary placeholder:text-base-300 scrollbar-thin"
        defaultValue={text}
      ></textarea>
      <button
        type="submit"
        className={clsx(
          "absolute bottom-2.5 md:bottom-4 m-auto right-2 w-[30px] h-[30px] rounded text-primary-content flex justify-center items-center",
          isPending || text.trim() === ""
            ? "bg-gray-600 cursor-not-allowed opacity-50"
            : "bg-primary hover:bg-accent cursor-pointer opacity-100"
        )}
        disabled={isPending || text.trim() === ""}
      >
        <FaPaperPlane />
      </button>
    </form>
  );
};

export default ChatInput;
