"use client";

import { setAIResponse } from "@/features/generalSlice";
import { RootState } from "@/store";
import { getResponseFromAI } from "@/utils/actions/response";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState, useTransition } from "react";
import { FaPaperPlane } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";

const ChatInput = ({ userId }: { userId: string }) => {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dispatch = useDispatch();
  const { aiResponse } = useSelector((store: RootState) => store.general);
  const [text, setText] = useState("");

  useEffect(() => {
    console.log(aiResponse);
  }, [aiResponse]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textRef.current) {
      textRef.current.style.height = "48px";
      textRef.current.style.height = `${textRef.current.scrollHeight}px`;
      if (textRef.current.scrollHeight > 48) {
        textRef.current.style.lineHeight = "20px";
      }
    }
  };

  const handleSubmit = (formData: FormData) => {
    startTransition(() => {
      getResponseFromAI(formData, window.location.pathname).then((res) => {
        if (res.success) {
          dispatch(setAIResponse(res.data.text));
          if (textRef.current) {
            textRef.current.value = "";
          }
        }
        if (res?.data.chatId && window.location.pathname === "/chat") {
          router.push(`/chat/${res.data.chatId}`);
        }
      });
    });
  };

  return (
    <form className="w-full my-3 relative" action={handleSubmit}>
      <input type="hidden" value={userId} id="id" name="id" />
      <textarea
        onChange={handleChange}
        ref={textRef}
        name="question"
        id="question"
        rows={1}
        placeholder="Ask Quick"
        className="w-full resize-none h-[48px] max-h-[200px] overflow-y-auto text-base py-3 pl-3 pr-8 rounded-lg bg-base-200 border-1 border-primary placeholder:text-base-300"
        defaultValue={text}
      ></textarea>
      <button
        type="submit"
        className={clsx(
          "absolute top-0 bottom-0 m-auto right-2 w-[30px] h-[30px] rounded text-primary-content flex justify-center items-center",
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
