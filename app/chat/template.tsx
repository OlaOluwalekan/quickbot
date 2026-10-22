import { auth } from "@/auth";
import ChatDesktopHeader from "@/components/chats/ChatDesktopHeader";
import ChatInput from "@/components/chats/ChatInput";
import ChatMobileHeader from "@/components/chats/ChatMobileHeader";
import Sidebar from "@/components/chats/Sidebar";
import { ChatProps } from "@/types/chats";
import { getChats } from "@/utils/actions/chat";
import { ReactNode } from "react";

const Template = async ({ children }: { children: ReactNode }) => {
  const session = await auth();
  let chats: ChatProps[] = [];
  let dates: string[] = [];

  if (session?.user?.id) {
    const chatResponse = await getChats(session?.user?.id);
    if (chatResponse.data) {
      chats = chatResponse.data.chats;
      dates = chatResponse.data.dates;
    }
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Mobile Header */}
      <ChatMobileHeader userId={session?.user?.id as string} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar (Off-canvas drawer on mobile, fixed 280px rail on desktop) */}
        <Sidebar data={session?.user} chats={chats} dates={dates} />

        {/* Main Chat Canvas */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <ChatDesktopHeader userId={session?.user?.id as string} />

          <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {children}
            </div>

            <ChatInput
              userId={session?.user?.id as string}

            />
          </main>
        </div>
      </div>
    </div>
  );
};

export default Template;
