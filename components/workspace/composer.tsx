"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Image as ImageIcon, MessageSquare, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui";
import { submitChatPrompt } from "@/utils/chat-stream-client";

export interface ComposerProps {
  initialPrompt?: string;
  initialMode?: "text" | "image";
  placeholder?: string;
  size?: "large" | "compact";
  className?: string;
  workspaceId?: string | null;
  autoFocus?: boolean;
  onSubmitted?: () => void;
}

export function Composer({
  initialPrompt = "",
  initialMode,
  placeholder,
  size = "large",
  className,
  workspaceId = null,
  autoFocus = false,
  onSubmitted,
}: ComposerProps) {
  const t = useTranslations("Chat");
  const tHome = useTranslations("Home");
  const router = useRouter();

  const storeChatMode = useUiStore((s) => s.chatMode);
  const setStoreChatMode = useUiStore((s) => s.setChatMode);
  const composerEnterToSend = useUiStore((s) => s.composerEnterToSend);

  const [prompt, setPrompt] = React.useState(initialPrompt);
  const [mode, setMode] = React.useState<"text" | "image">(
    initialMode || storeChatMode || "text",
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const adjustHeight = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minH = size === "large" ? 64 : 44;
    const maxH = size === "large" ? 280 : 180;
    const nextH = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${nextH}px`;
  }, [size]);

  React.useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
      if (textareaRef.current) {
        textareaRef.current.value = initialPrompt;
        adjustHeight();
        // Highlight first {{placeholder}} if present
        const match = /\{\{([^}]+)\}\}/.exec(initialPrompt);
        if (match && match.index !== undefined) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            match.index,
            match.index + match[0].length,
          );
          return;
        }
      }
    }
  }, [initialPrompt, adjustHeight]);

  React.useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleModeChange = (nextMode: "text" | "image") => {
    setMode(nextMode);
    setStoreChatMode(nextMode);
  };

  const handleSubmit = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || isSubmitting) return;

    setIsSubmitting(true);
    setPrompt("");
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = size === "large" ? "64px" : "44px";
    }

    try {
      await submitChatPrompt({
        prompt: cleanPrompt,
        chatId: workspaceId,
        mode,
        onNavigateChat: (newChatId) => {
          router.push(`/workspaces/${newChatId}`);
          router.refresh();
        },
        onRefresh: () => {
          router.refresh();
        },
      });
      onSubmitted?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      if (composerEnterToSend && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (!composerEnterToSend && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };

  const isLarge = size === "large";
  const defaultPlaceholder =
    mode === "image"
      ? tHome("composerImagePlaceholder")
      : tHome("composerPlaceholder");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className={cn(
        "relative flex flex-col rounded-2xl sm:rounded-3xl border border-border bg-surface shadow-md transition-all focus-within:border-accent/80 focus-within:ring-2 focus-within:ring-ring/40",
        isLarge ? "p-3 sm:p-4" : "p-2 sm:p-3",
        className,
      )}
    >
      {/* Textarea Input */}
      <textarea
        ref={textareaRef}
        rows={isLarge ? 2 : 1}
        value={prompt}
        disabled={isSubmitting}
        onChange={(e) => {
          setPrompt(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || defaultPlaceholder}
        className={cn(
          "w-full resize-none bg-transparent text-fg placeholder:text-subtle focus:outline-none leading-relaxed",
          isLarge ? "text-sm sm:text-base min-h-[64px]" : "text-xs sm:text-sm min-h-[44px]",
        )}
      />

      {/* Controls Bar: Mode Switch & Send Button */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-1">
        <div className="flex items-center gap-1 rounded-xl bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => handleModeChange("text")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              mode === "text"
                ? "bg-surface text-accent shadow-xs"
                : "text-muted hover:text-fg",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>{t("modeText")}</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("image")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              mode === "image"
                ? "bg-surface text-accent shadow-xs"
                : "text-muted hover:text-fg",
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>{t("modeImage")}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {prompt.length > 90_000 && (
            <span className="text-[11px] font-mono text-muted">
              {prompt.length} / 100,000
            </span>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !prompt.trim()}
            aria-label={t("send")}
            className={cn(
              "flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl shadow-sm transition-all cursor-pointer",
              prompt.trim() && !isSubmitting
                ? "bg-accent text-accent-fg hover:bg-accent-hover active:scale-95"
                : "cursor-not-allowed bg-surface-3 text-subtle opacity-60",
            )}
          >
            {isSubmitting ? (
              <Sparkles className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Send className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export default Composer;
