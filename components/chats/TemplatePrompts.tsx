"use client";

import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import { submitChatPrompt } from "@/utils/chat-stream-client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import ResponseMD from "./markdown/ResponseMD";

const TemplatePrompts = ({
  data,
  userId: _userId,
}: {
  data: { name: string; domain: string | null }[];
  userId: string;
}) => {
  const t = useTranslations("Chat");
  const chatMode = useUiStore((s) => s.chatMode);
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);
  const setCurrentPageId = useUiStore((s) => s.setCurrentPageId);
  const clearOptimisticResponses = useUiStore(
    (s) => s.clearOptimisticResponses,
  );

  const streamState = useGenerationStore((s) => s.streams["__new__"]);
  const isStreaming = streamState?.status === "streaming";
  const streamingPrompt = streamState?.prompt ?? "";
  const streamingText = streamState?.text ?? "";

  const router = useRouter();

  useEffect(() => {
    setCurrentPageTitle(t("newChat"));
    setCurrentPageId(null);
    clearOptimisticResponses();
  }, [setCurrentPageTitle, setCurrentPageId, clearOptimisticResponses, t]);

  const handleSelectPrompt = async (promptText: string) => {
    if (isStreaming) return;

    await submitChatPrompt({
      prompt: promptText,
      chatId: null,
      mode: chatMode,
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
        <div className="w-full max-w-2xl bg-surface border border-border rounded-3xl p-5 shadow-md mb-8">
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="animate-spin h-4 w-4" strokeWidth={1.5} />
            <span>
              {chatMode === "image" ? t("generatingImage") : t("generating")}
            </span>
          </div>
          {streamingPrompt && (
            <p className="text-sm font-medium text-fg mb-3 pb-3 border-b border-border">
              {streamingPrompt}
            </p>
          )}
          {streamingText && (
            <div className="text-sm text-muted">
              <ResponseMD response={streamingText} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-accent-soft text-accent mb-3">
              <Sparkles className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-fg">
              {t("welcomeTitle")}
            </h2>
            <p className="text-sm text-muted mt-1">{t("welcomeSubtitle")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
            {data.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPrompt(item.name)}
                className="group flex flex-col items-start p-4 rounded-2xl border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-all text-left shadow-xs cursor-pointer"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  {item.domain && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent-soft px-2 py-0.5 rounded-full">
                      {item.domain}
                    </span>
                  )}
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-subtle group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all ml-auto"
                    strokeWidth={1.5}
                  />
                </div>
                <span className="text-sm font-medium text-fg group-hover:text-accent">
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
