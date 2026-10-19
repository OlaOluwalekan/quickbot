"use client";

import {
  clearOptimisticResponses,
  setCurrentPageId,
  setCurrentPageTitle,
} from "@/features/generalSlice";
import { AppDispatch, RootState } from "@/store";
import { submitChatPrompt } from "@/utils/chat-stream-client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  FaArrowUpRightFromSquare,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import ResponseMD from "./markdown/ResponseMD";
import toast from "react-hot-toast";

const TemplatePrompts = ({
  data,
  userId,
  existingToken,
}: {
  data: { name: string; domain: string | null }[];
  userId: string;
  existingToken: number;
}) => {
  const t = useTranslations("Chat");
  const dispatch = useDispatch<AppDispatch>();
  const { isStreaming, streamingPrompt, streamingText, chatMode } = useSelector(
    (store: RootState) => store.general
  );
  const router = useRouter();

  useEffect(() => {
    dispatch(setCurrentPageTitle(t("newChat")));
    dispatch(setCurrentPageId(null));
    dispatch(clearOptimisticResponses());
  }, [dispatch, t]);

  const handleSelectPrompt = async (promptText: string) => {
    if (isStreaming) return;
    if (existingToken <= 0) {
      toast.error(t("outOfTokens"));
      return;
    }

    await submitChatPrompt({
      prompt: promptText,
      chatId: null,
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

  if (isStreaming && streamingPrompt) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-none pt-6 pb-6 max-w-4xl mx-auto w-full px-3 sm:px-6 flex flex-col gap-6">
        <div className="w-full flex justify-end">
          <div className="max-w-[85%] sm:max-w-[75%] bg-gradient-to-br from-indigo-600 to-indigo-500 text-white py-3 px-4 rounded-2xl rounded-br-xs shadow-sm text-sm sm:text-base">
            {streamingPrompt}
          </div>
        </div>

        <div className="w-full flex gap-3 items-start">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex justify-center items-center text-indigo-500 animate-pulse">
            <FaWandMagicSparkles className="text-base" />
          </div>
          <div className="flex-1 rounded-2xl rounded-tl-xs border border-indigo-500/30 bg-white dark:bg-slate-900/90 p-4 shadow-sm">
            {streamingText ? (
              <div className="markdown prose prose-slate dark:prose-invert max-w-none text-sm sm:text-base whitespace-pre-wrap break-words">
                <ResponseMD response={streamingText} />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                <span className="ml-1">
                  {chatMode === "image"
                    ? t("generatingImage")
                    : t("generating")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col justify-center items-center px-4 py-8">
      <div className="max-w-3xl w-full flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-sky-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-500 mb-4 shadow-sm">
          <FaWandMagicSparkles className="text-2xl" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
          {t("welcomeTitle")}
        </h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-xl">
          {t("welcomeSubtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-3xl w-full">
        {data.map((item, i) => (
          <button
            key={i}
            type="button"
            disabled={isStreaming}
            onClick={() => handleSelectPrompt(item.name)}
            className="group text-left p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white/80 dark:bg-slate-900/70 hover:border-indigo-500/50 hover:shadow-md hover:shadow-indigo-500/5 transition-all flex flex-col justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {item.domain || "general"}
              </span>
              <FaArrowUpRightFromSquare className="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors" />
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
              {item.name}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TemplatePrompts;
