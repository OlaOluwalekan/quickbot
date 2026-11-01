import { getActor } from "@/server/auth/session";
import ChatInput from "@/components/chats/ChatInput";
import { ReactNode } from "react";

const Template = async ({ children }: { children: ReactNode }) => {
  const actor = await getActor();

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      <ChatInput userId={(actor?.userId ?? "") as string} />
    </div>
  );
};

export default Template;
