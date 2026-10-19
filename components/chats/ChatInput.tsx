"use client";

import {
  setChatInputHeight,
  setChatMode,
} from "@/features/generalSlice";
import { AppDispatch, RootState } from "@/store";
import { submitChatPrompt } from "@/utils/chat-stream-client";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FaImage,
  FaPaperPlane,
  FaRegCommentDots,
} from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";

const ChatInput = ({
  userId,
  existingToken,
}: {
  userId: string;
  existingToken: number;
}) => {
  const t = useTranslations("Chat");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch<AppDispatch>();
  const [text, setText] = useState("");
  const { currentPageTitle, isStreaming, loadingResponse, chatMode } =
    useSelector((store: RootState) => store.general);

  const isBusy = isStreaming || loadingResponse;

  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = "48px";
    }
  }, []);

  const resetTextarea = () => {
    setText("");
    if (textRef.current) {
      textRef.current.value = "";
      textRef.current.style.height = "48px";
    }
    dispatch(setChatInputHeight("56px"));
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textRef.current) {
      textRef.current.style.height = "48px";
      const nextHeight = Math.min(textRef.current.scrollHeight, 180);
      textRef.current.style.height = `${nextHeight}px`;
      dispatch(setChatInputHeight(`${nextHeight + 16}px`));
    }
  };

  const triggerSend = async () => {
    const prompt = text.trim();
    if (!prompt || isBusy) return;

    if (existingToken <= 0) {
      toast.error(t("outOfTokens"));
      return;
    }

    const activePath =
      pathname ||
      (typeof window !== "undefined" ? window.location.pathname : "/chat");
    const activeChatId =
      activePath && activePath !== "/chat" && activePath.startsWith("/chat/")
        ? activePath.split("/").pop() || null
        : null;

    resetTextarea();

    await submitChatPrompt({
      prompt,
      chatId: activeChatId,
      mode: chatMode,
      dispatch,
      onNavigateChat: (newChatId) => {
        router.push(`/chat/${newChatId}`);
        router.refresh();
      },
      onRefresh: () => {
        router.refresh();
      },
    });
  };

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await triggerSend();
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await triggerSend();
    }
  };

  return (
    <div
      className={clsx(
        "w-full pt-2 pb-3 bg-gradient-to-t from-base-100 via-base-100/95 to-transparent dark:from-dark-base-100 dark:via-dark-base-100/95 shrink-0",
        currentPageTitle === "" && "hidden"
      )}
    >
      <div className="max-w-4xl mx-auto w-full px-2 sm:px-4">
        <form
          onSubmit={handleFormSubmit}
          className="relative flex flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 shadow-lg shadow-indigo-500/5 focus-within:border-indigo-500/70 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all"
        >
          <input type="hidden" value={userId} id="id" name="id" />

          {/* Mode Selector Pill Bar */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1 border-b border-slate-100 dark:border-slate-800/80">
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 p-1">
              <button
                type="button"
                onClick={() => dispatch(setChatMode("text"))}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  chatMode === "text"
                    ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <FaRegCommentDots className="text-xs" />
                <span>{t("modeText")}</span>
              </button>
              <button
                type="button"
                onClick={() => dispatch(setChatMode("image"))}
                className={clsx(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                  chatMode === "image"
                    ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <FaImage className="text-xs" />
                <span>{t("modeImage")}</span>
              </button>
            </div>

            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hidden sm:inline">
              {t("tokensRemaining", { count: existingToken ?? 0 })}
            </span>
          </div>

          {/* Textarea & Send Button Row */}
          <div className="relative flex items-end gap-2 px-3 py-2">
            <textarea
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              ref={textRef}
              name="question"
              id="question"
              rows={1}
              value={text}
              disabled={isBusy}
              placeholder={
                chatMode === "image"
                  ? t("imageInputPlaceholder")
                  : t("inputPlaceholder")
              }
              className="w-full resize-none h-[44px] max-h-[180px] overflow-y-auto scrollbar-none text-sm sm:text-base py-2 pr-2 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label={t("send")}
              disabled={isBusy || text.trim() === ""}
              className={clsx(
                "shrink-0 w-10 h-10 rounded-xl flex justify-center items-center transition-all",
                isBusy || text.trim() === ""
                  ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-md shadow-indigo-500/25 hover:opacity-95 active:scale-95 cursor-pointer"
              )}
            >
              <FaPaperPlane className="text-sm" />
            </button>
          </div>
        </form>

        <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-1.5">
          {t("disclaimer")}
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
