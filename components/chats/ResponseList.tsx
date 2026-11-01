"use client";

import { ResponseProps } from "@/types/chats";
import React, { useEffect, useMemo, useRef, useTransition } from "react";
import Response from "./Response";
import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import ResponseMD from "./markdown/ResponseMD";
import UserImage from "./UserImage";
import { Sparkles } from "lucide-react";
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

  const chatMode = useUiStore((s) => s.chatMode);
  const currentPageTitle = useUiStore((s) => s.currentPageTitle);
  const optimisticResponses = useUiStore((s) => s.optimisticResponses);
  const clearOptimisticResponses = useUiStore(
    (s) => s.clearOptimisticResponses,
  );
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);
  const setCurrentPageId = useUiStore((s) => s.setCurrentPageId);

  const currentChatId = data[0]?.chatId;
  const streamState = useGenerationStore((s) =>
    currentChatId ? s.streams[currentChatId] : undefined,
  );
  const isStreaming = streamState?.status === "streaming";
  const streamingPrompt = streamState?.prompt ?? "";
  const streamingText = streamState?.text ?? "";

  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!currentChatId) return;
    clearOptimisticResponses();
    startTransition(() => {
      fetch(`/api/v1/workspaces/${currentChatId}`)
        .then((r) => r.json())
        .then((res) => {
          const ws = res?.data?.workspace || res?.data?.chat || res?.data;
          if (ws?.id && ws?.title) {
            setCurrentPageTitle(ws.title);
            setCurrentPageId(ws.id);
          }
        })
        .catch(() => {});
    });

    if (containerRef.current) {
      let parent = containerRef.current.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollTop > 0) {
          parent.scrollTop = 0;
        }
        parent = parent.parentElement;
      }
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [
    currentChatId,
    clearOptimisticResponses,
    setCurrentPageTitle,
    setCurrentPageId,
  ]);

  useEffect(() => {
    if (currentPageTitle) {
      document.title = `${currentPageTitle} | Klecx`;
    }
  }, [currentPageTitle]);

  const mergedResponses = useMemo(() => {
    const existingIds = new Set(data.map((item) => item.id));
    const extras = optimisticResponses.filter(
      (item) => item.chatId === currentChatId && !existingIds.has(item.id),
    );
    return [...data, ...extras];
  }, [data, optimisticResponses, currentChatId]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
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
      className="flex-1 min-h-0 overflow-y-auto w-full pt-4 pb-6 flex flex-col"
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
              <div className="bg-accent text-accent-fg py-3 px-4 rounded-2xl rounded-br-xs shadow-sm text-sm sm:text-base whitespace-pre-wrap break-words">
                {streamingPrompt}
              </div>
            </div>
          </div>

          {/* Klecx Live Streaming Bubble */}
          <div className="w-full flex justify-start">
            <div className="w-full max-w-[95%] sm:max-w-[88%] flex gap-3 items-start">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-accent-soft border border-border flex justify-center items-center text-accent animate-pulse mt-0.5">
                <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 text-xs">
                  <span className="font-bold text-accent">Klecx</span>
                  <span className="text-subtle animate-pulse">
                    {chatMode === "image"
                      ? t("generatingImage")
                      : t("generating")}
                  </span>
                </div>

                <div className="rounded-2xl rounded-tl-xs border border-border bg-surface p-4 shadow-sm text-fg">
                  {chatMode === "image" ? (
                    <div className="w-full max-w-sm h-64 rounded-xl bg-surface-2 animate-pulse flex flex-col items-center justify-center gap-2 text-muted">
                      <Sparkles
                        className="h-6 w-6 text-accent animate-spin"
                        strokeWidth={1.5}
                      />
                      <span className="text-xs font-medium">
                        {t("generatingImage")}
                      </span>
                    </div>
                  ) : streamingText ? (
                    <div className="markdown max-w-none text-sm sm:text-base whitespace-pre-wrap break-words leading-relaxed">
                      <ResponseMD response={streamingText} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-2">
                      <span className="w-2 h-2 rounded-full bg-accent animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
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
