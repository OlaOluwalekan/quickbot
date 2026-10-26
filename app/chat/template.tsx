import { getActor } from "@/server/auth/session";
import ChatDesktopHeader from "@/components/chats/ChatDesktopHeader";
import ChatInput from "@/components/chats/ChatInput";
import ChatMobileHeader from "@/components/chats/ChatMobileHeader";
import Sidebar from "@/components/chats/Sidebar";
import { ChatProps } from "@/types/chats";
import { getChats } from "@/utils/actions/chat";
import { ReactNode } from "react";

const Template = async ({ children }: { children: ReactNode }) => {
  const actor = await getActor();
  let chats: ChatProps[] = [];
  let dates: string[] = [];

  if (actor?.userId) {
    const chatResponse = await getChats(actor.userId);
    if (chatResponse.data) {
      chats = chatResponse.data.chats;
      dates = chatResponse.data.dates;
    }
  }

  const sidebarUser = actor
    ? {
        id: actor.userId,
        name: actor.name ?? "",
        email: actor.email,
        image: actor.image ?? null,
      }
    : undefined;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
      {/* Mobile Header */}
      <ChatMobileHeader userId={(actor?.userId ?? "") as string} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar (Off-canvas drawer on mobile, fixed 280px rail on desktop) */}
        <Sidebar data={sidebarUser} chats={chats} dates={dates} />

        {/* Main Chat Canvas */}
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <ChatDesktopHeader userId={(actor?.userId ?? "") as string} />

          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>

            <ChatInput userId={(actor?.userId ?? "") as string} />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Template;
