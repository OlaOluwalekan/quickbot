"use client";

import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
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
import { Image as ImageIcon, MessageSquare, Send } from "lucide-react";

const ChatInput = ({ userId: _userId }: { userId: string }) => {
  const t = useTranslations("Chat");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [tokens, setTokens] = useState<number | null>(null);

  const currentPageTitle = useUiStore((s) => s.currentPageTitle);
  const chatMode = useUiStore((s) => s.chatMode);
  const setChatMode = useUiStore((s) => s.setChatMode);
  const setChatInputHeight = useUiStore((s) => s.setChatInputHeight);

  const isStreaming = useGenerationStore((s) =>
    Object.values(s.streams).some((st) => st.status === "streaming"),
  );

  const isBusy = isStreaming;

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
    setChatInputHeight("56px");
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textRef.current) {
      textRef.current.style.height = "48px";
      const nextHeight = Math.min(textRef.current.scrollHeight, 180);
      textRef.current.style.height = `${nextHeight}px`;
      setChatInputHeight(`${nextHeight + 16}px`);
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
        "w-full shrink-0 bg-bg pt-2 pb-3",
        currentPageTitle === "" && "hidden",
      )}
    >
      <div className="mx-auto w-full max-w-4xl px-2 sm:px-4">
        <form
          onSubmit={handleFormSubmit}
          className="rounded-3xl border border-border bg-surface/90 p-2 shadow-md backdrop-blur-md"
        >
          {/* Top Row: Mode Toggle & Token Badge */}
          <div className="mb-1 flex items-center justify-between px-2 pt-1 text-xs text-muted">
            <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setChatMode("text")}
                disabled={isBusy}
                className={clsx(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  chatMode === "text"
                    ? "bg-surface text-accent shadow-xs"
                    : "text-muted hover:text-fg",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{t("modeText")}</span>
              </button>
              <button
                type="button"
                onClick={() => setChatMode("image")}
                disabled={isBusy}
                className={clsx(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  chatMode === "image"
                    ? "bg-surface text-accent shadow-xs"
                    : "text-muted hover:text-fg",
                )}
              >
                <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>{t("modeImage")}</span>
              </button>
            </div>

            {tokens !== null && (
              <span className="text-[11px] font-semibold text-subtle">
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
              className="max-h-45 min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-fg placeholder:text-subtle focus:outline-none"
            />

            <button
              type="submit"
              disabled={isBusy || !text.trim()}
              aria-label="Send message"
              className={clsx(
                "mb-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl shadow-sm transition-all",
                !isBusy && text.trim()
                  ? "bg-accent text-accent-fg hover:bg-accent-hover active:scale-95"
                  : "cursor-not-allowed bg-surface-3 text-subtle",
              )}
            >
              <Send className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInput;
