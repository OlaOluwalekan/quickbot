"use client";

import { setChatInputHeight, setChatMode } from "@/features/generalSlice";
import { AppDispatch, RootState } from "@/store";
import { submitChatPrompt } from "@/utils/chat-stream-client";
import { formatNumber } from "@/utils/format";
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
      (typeof window !== "undefined"
        ? window.location.pathname
        : "/workspaces");
    const activeChatId =
      activePath &&
      activePath !== "/chat" &&
      activePath !== "/workspaces" &&
      (activePath.startsWith("/chat/") || activePath.startsWith("/workspaces/"))
        ? activePath.split("/").pop() || null
        : null;

    resetTextarea();

    await submitChatPrompt({
      prompt,
      chatId: activeChatId,
      mode: chatMode,
      dispatch,
      onNavigateChat: (newChatId) => {
        router.push(`/workspaces/${newChatId}`);
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
          className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90"
        >
          {/* Top Row: Mode Toggle & Token Badge */}
          <div className="mb-1 flex items-center justify-between px-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => dispatch(setChatMode("text"))}
                disabled={isBusy}
                className={clsx(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  chatMode === "text"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <FaRegCommentDots className="text-xs" />
                <span>{t("modeText")}</span>
              </button>
              <button
                type="button"
                onClick={() => dispatch(setChatMode("image"))}
                disabled={isBusy}
                className={clsx(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  chatMode === "image"
                    ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <FaImage className="text-xs" />
                <span>{t("modeImage")}</span>
              </button>
            </div>

            {tokens !== null && (
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                {t("tokensRemaining", { count: formatNumber(tokens) })}
              </span>
            )}
          </div>

          {/* Main Input Row */}
          <div className="flex items-end gap-2">
            <textarea
              ref={textRef}
              rows={1}
              value={text}
              disabled={isBusy}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={
                chatMode === "image"
                  ? t("imageInputPlaceholder")
                  : t("inputPlaceholder")
              }
              className="max-h-45 min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder-slate-500"
            />

            <button
              type="submit"
              disabled={isBusy || !text.trim()}
              aria-label="Send message"
              className={clsx(
                "mb-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl text-white shadow-md transition-all",
                !isBusy && text.trim()
                  ? "bg-indigo-600 hover:bg-indigo-500 active:scale-95"
                  : "cursor-not-allowed bg-slate-300 dark:bg-slate-700"
              )}
            >
              <FaPaperPlane className="text-xs" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
