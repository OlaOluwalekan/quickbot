"use client";

import { useUiStore } from "@/lib/stores/ui";
import { ChatProps } from "@/types/chats";
import clsx from "clsx";
import Link from "next/link";
import { MouseEvent } from "react";
import { MessageSquare, MoreVertical } from "lucide-react";

const Chat = ({ chat }: { chat: ChatProps }) => {
  const currentPageId = useUiStore((s) => s.currentPageId);
  const chatMenuIsOpen = useUiStore((s) => s.chatMenuIsOpen);
  const dialogData = useUiStore((s) => s.dialogData);
  const toggleChatMenuOpen = useUiStore((s) => s.toggleChatMenuOpen);
  const setDialogData = useUiStore((s) => s.setDialogData);
  const setChatMenuClass = useUiStore((s) => s.setChatMenuClass);
  const toggleMobileNavOpen = useUiStore((s) => s.toggleMobileNavOpen);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (
      e.currentTarget.className.includes("a-modal") &&
      dialogData?.id !== chat.id
    ) {
      toggleChatMenuOpen(true);
    } else {
      toggleChatMenuOpen(!chatMenuIsOpen);
    }
    setDialogData(chat);
    const target = e.currentTarget.getBoundingClientRect();
    setChatMenuClass(`${Math.max(12, target.top - 110)}px`);
  };

  const isActive = currentPageId === chat.id;

  return (
    <div className="w-full">
      <div
        className={clsx(
          "group w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs sm:text-sm transition-colors",
          isActive
            ? "bg-accent-soft text-accent font-medium border border-border"
            : "text-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Link
          href={`/workspaces/${chat.id}`}
          className="flex-1 min-w-0 flex items-center gap-2.5 truncate"
          onClick={() => toggleMobileNavOpen(false)}
        >
          <MessageSquare
            strokeWidth={1.5}
            className={clsx(
              "h-3.5 w-3.5 shrink-0",
              isActive ? "text-accent" : "text-subtle",
            )}
          />
          <span className="truncate">{chat.title}</span>
        </Link>
        <button
          type="button"
          onClick={handleClick}
          aria-label="Conversation options"
          className={clsx(
            "a-modal p-1.5 rounded-lg text-subtle hover:text-fg hover:bg-surface-3 transition-opacity cursor-pointer shrink-0",
            chat.id,
          )}
        >
          <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default Chat;
