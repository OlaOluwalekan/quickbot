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

const TemplatePrompts = ({
  data,
  userId: _userId,
}: {
  data: { name: string; domain: string | null }[];
  userId: string;
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

    await submitChatPrompt({
      prompt: promptText,
      chatId: null,
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

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-3xl mx-auto w-full">
      {isStreaming ? (
        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl p-5 shadow-xl shadow-indigo-500/5 mb-8">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-500">
            <FaWandMagicSparkles className="animate-spin text-sm" />
            <span>{chatMode === "image" ? t("generatingImage") : t("generating")}</span>
          </div>
          {streamingPrompt && (
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              {streamingPrompt}
            </p>
          )}
          {streamingText && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <ResponseMD response={streamingText} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 mb-3">
              <FaWandMagicSparkles className="text-xl" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("welcomeTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("welcomeSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
            {data.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPrompt(item.name)}
                className="group flex flex-col items-start p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:border-indigo-500/30 transition-all text-left shadow-xs cursor-pointer"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  {item.domain && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                      {item.domain}
                    </span>
                  )}
                  <FaArrowUpRightFromSquare className="text-xs text-slate-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all ml-auto" />
                </div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default TemplatePrompts;
