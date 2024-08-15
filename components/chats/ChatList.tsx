"use client";

import { ChatProps } from "@/types/chats";
import Chat from "./Chat";

const ChatList = ({ chats }: { chats: ChatProps[] }) => {
  return (
    <div className="flex flex-col gap-1 flex-grow overflow-auto scrollbar-thin scrollbar-thumb-sky-700 scrollbar-track-sky-300 scrollbar-track-rounded-full scrollbar-thumb-rounded-full">
      {chats.map((chat) => {
        return <Chat key={chat.id} chat={chat} />;
      })}
    </div>
  );
};

export default ChatList;
