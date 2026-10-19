"use client";

import { ChatProps } from "@/types/chats";
import Chat from "./Chat";
import { formatCustomDate } from "@/utils/format";
import { useTranslations } from "next-intl";

const ChatList = ({
  chats,
  dates,
  grouped,
}: {
  chats: ChatProps[];
  dates: string[];
  grouped: Record<string, ChatProps[]>;
}) => {
  const t = useTranslations("Chat");

  return (
    <div className="flex flex-col gap-3 flex-1 overflow-y-auto px-2.5 py-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
      {chats.length === 0 ? (
        <div className="w-full h-full flex justify-center items-center text-center px-4 text-xs text-slate-400">
          {t("noChatsYet")}
        </div>
      ) : (
        dates.map((date) => (
          <div key={date} className="space-y-1">
            <div className="px-2 pt-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {formatCustomDate(date)}
              </span>
            </div>
            <div className="space-y-0.5">
              {grouped[date]?.map((chat) => (
                <Chat key={chat.id} chat={chat} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ChatList;
