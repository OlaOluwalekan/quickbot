"use client";

import { setChatInputHeight, setChatMode } from "@/features/generalSlice";
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
import { FaImage, FaPaperPlane, FaRegCommentDots } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";

const ChatInput = ({ userId }: { userId: string }) => {
  const t = useTranslations("Chat");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch<AppDispatch>();
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState<number | null>(null);
  const { currentPageTitle, isStreaming, loadingResponse, chatMode } =
    useSelector((store: RootState) => store.general);

  const isBusy = isStreaming || loadingResponse;

  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = "48px";
    }
  }, []);

  useEffect(() => {
    if (typeof fetch === "function") {
      fetch("/api/user/tokens")
        .then((res) => res.json())
        .then((res) => {
          if (res?.success && typeof res.data?.tokens === "number") {
            setTokens(res.data.tokens);
          }
        })
        .catch(() => {});
    }
  }, [isStreaming]);

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
        "from-base-100 via-base-100/95 dark:from-dark-base-100 dark:via-dark-base-100/95 w-full shrink-0 bg-linear-to-t to-transparent pt-2 pb-3",
        currentPageTitle === "" && "hidden"
      )}
    >
      <div className="mx-auto w-full max-w-4xl px-2 sm:px-4">
        <form
          onSubmit={handleFormSubmit}
          className="relative flex flex-col rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg shadow-indigo-500/5 transition-all focus-within:border-indigo-500/70 focus-within:ring-2 focus-within:ring-indigo-500/15 dark:border-slate-800 dark:bg-slate-900/95"
        >
          <input type="hidden" value={userId} id="id" name="id" />

          {/* Mode Selector Pill Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 pt-2.5 pb-1 dark:border-slate-800/80">
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/90">
              <button
                type="button"
                onClick={() => dispatch(setChatMode("text"))}
                className={clsx(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  chatMode === "text"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <FaRegCommentDots className="text-xs" />
                <span>{t("modeText")}</span>
              </button>

              <button
                type="button"
                onClick={() => dispatch(setChatMode("image"))}
                className={clsx(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  chatMode === "image"
                    ? "bg-linear-to-r from-indigo-500 to-sky-500 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <FaImage className="text-xs" />
                <span>{t("modeImage")}</span>
              </button>
            </div>

            {tokens !== null && (
              <span className="hidden text-[11px] font-medium text-slate-400 sm:inline dark:text-slate-500">
                {t("tokensRemaining", { count: tokens })}
              </span>
            )}
          </div>

          {/* Textarea & Send Button Row */}
          <div className="relative flex items-end gap-2 px-3 py-2">
            <textarea
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              ref={textRef}
              rows={1}
              value={text}
              name="question"
              id="question"
              placeholder={
                chatMode === "image"
                  ? t("imageInputPlaceholder")
                  : t("inputPlaceholder")
              }
              className="h-11 max-h-45 w-full resize-none scrollbar-none overflow-y-auto bg-transparent py-2 pr-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60 sm:text-base dark:text-slate-100 dark:placeholder:text-slate-500"
              disabled={isBusy}
            />

            <button
              type="submit"
              aria-label={t("send")}
              disabled={isBusy || text.trim() === ""}
              className={clsx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                isBusy || text.trim() === ""
                  ? "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
                  : "cursor-pointer bg-linear-to-r from-indigo-600 to-sky-500 text-white shadow-md shadow-indigo-500/25 hover:opacity-95 active:scale-95"
              )}
            >
              <FaPaperPlane className="text-sm" />
            </button>
          </div>
        </form>

        <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
          {t("disclaimer")}
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
