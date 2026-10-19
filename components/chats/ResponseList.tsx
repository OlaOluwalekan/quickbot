"use client";

import { ResponseProps } from "@/types/chats";
import React, { useEffect, useMemo, useRef, useTransition } from "react";
import Response from "./Response";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import { getChatById } from "@/utils/actions/chat";
import {
  clearOptimisticResponses,
  setCurrentPageId,
  setCurrentPageTitle,
} from "@/features/generalSlice";
import ResponseMD from "./markdown/ResponseMD";
import UserImage from "./UserImage";
import { FaWandMagicSparkles } from "react-icons/fa6";
import { useTranslations } from "next-intl";

const ResponseList = ({
  data,
  image,
}: {
  data: ResponseProps[];
  image: string | null;
}) => {
  const t = useTranslations("Chat");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollingRef = useRef(true);
  const {
    isStreaming,
    streamingPrompt,
    streamingText,
    chatMode,
    currentPageTitle,
    optimisticResponses,
  } = useSelector((store: RootState) => store.general);
  const [, startTransition] = useTransition();
  const dispatch = useDispatch();

  const currentChatId = data[0]?.chatId;

  // On mount or chat switch, reset ancestor scroll offsets and scroll to bottom
  useEffect(() => {
    if (!currentChatId) return;
    dispatch(clearOptimisticResponses());
    startTransition(() => {
      getChatById(currentChatId).then((res) => {
        if (res?.success && res.data?.chat) {
          dispatch(setCurrentPageTitle(res.data.chat.title));
          dispatch(setCurrentPageId(res.data.chat.id));
        }
      });
    });

    if (containerRef.current) {
      // Ensure any ancestor element that might have been scrolled by scrollIntoView is reset
      let parent = containerRef.current.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollTop > 0) {
          parent.scrollTop = 0;
        }
        parent = parent.parentElement;
      }
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [currentChatId, dispatch]);

  useEffect(() => {
    if (currentPageTitle) {
      document.title = `${currentPageTitle} | Klecx`;
    }
  }, [currentPageTitle]);

  const mergedResponses = useMemo(() => {
    const existingIds = new Set(data.map((item) => item.id));
    const extras = optimisticResponses.filter(
      (item) => item.chatId === currentChatId && !existingIds.has(item.id)
    );
    return [...data, ...extras];
  }, [data, optimisticResponses, currentChatId]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Track if user is near bottom (within 150px) to auto-scroll, or has intentionally scrolled up
    isAutoScrollingRef.current = scrollHeight - scrollTop - clientHeight < 150;
  };

  useEffect(() => {
    if (!isAutoScrollingRef.current || !containerRef.current) return;
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: isStreaming ? "auto" : "smooth",
    });
  }, [mergedResponses.length, isStreaming, streamingText]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto w-full pt-4 pb-6 flex flex-col scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 hover:scrollbar-thumb-slate-400 dark:hover:scrollbar-thumb-slate-600 scrollbar-track-transparent"
    >
      {mergedResponses.map((response) => (
        <Response key={response.id} response={response} image={image} />
      ))}

      {/* Live SSE Streaming Turn or Image Generation Shimmer */}
      {isStreaming && streamingPrompt && (
        <div className="flex flex-col gap-5 mb-6 max-w-4xl mx-auto w-full px-2 sm:px-4 animate-fade-in">
          {/* User Question */}
          <div className="w-full flex justify-end">
            <div className="max-w-[85%] sm:max-w-[75%] flex flex-row-reverse gap-2.5 items-end">
              <div className="shrink-0">
                <UserImage image={image} />
              </div>
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-500 text-white py-3 px-4 rounded-2xl rounded-br-xs shadow-sm text-sm sm:text-base whitespace-pre-wrap break-words">
                {streamingPrompt}
              </div>
            </div>
          </div>

          {/* Klecx Live Streaming Bubble */}
          <div className="w-full flex justify-start">
            <div className="w-full max-w-[95%] sm:max-w-[88%] flex gap-3 items-start">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 border border-indigo-500/30 flex justify-center items-center text-indigo-500 animate-pulse mt-0.5">
                <FaWandMagicSparkles className="text-base" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 text-xs">
                  <span className="font-bold bg-gradient-to-r from-indigo-500 to-sky-500 bg-clip-text text-transparent">
                    Klecx
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 animate-pulse">
                    {chatMode === "image"
                      ? t("generatingImage")
                      : t("generating")}
                  </span>
                </div>

                <div className="rounded-2xl rounded-tl-xs border border-indigo-500/30 bg-white dark:bg-slate-900/90 p-4 shadow-sm text-slate-800 dark:text-slate-100">
                  {chatMode === "image" ? (
                    <div className="w-full max-w-sm h-64 rounded-xl bg-gradient-to-r from-slate-200 via-indigo-500/10 to-slate-200 dark:from-slate-800 dark:via-indigo-500/15 dark:to-slate-800 animate-pulse flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                      <FaWandMagicSparkles className="text-2xl text-indigo-500 animate-spin" />
                      <span className="text-xs font-medium">
                        {t("generatingImage")}
                      </span>
                    </div>
                  ) : streamingText ? (
                    <div className="markdown prose prose-slate dark:prose-invert max-w-none text-sm sm:text-base whitespace-pre-wrap break-words leading-relaxed">
                      <ResponseMD response={streamingText} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-sky-500 animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default ResponseList;
