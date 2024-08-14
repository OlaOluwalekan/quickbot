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
  if (session?.user?.id) {
    const chatResponse = await getChats(session?.user?.id);
    chats = chatResponse.data.chats;
  }
  console.log("SESSION USER:", session?.user);
  // console.log("CHATS:", chats);

  return (
    <div className="h-screen flex flex-col">
      <ChatMobileHeader />
      <div className="flex flex-grow">
        <Sidebar data={session?.user} chats={chats} />
        <div className="w-full h-full flex flex-col bg-green-200">
          <ChatDesktopHeader />
          <div className="flex flex-col flex-grow bg-primary md:pt-3 md:pb-2 md:pr-2">
            <section className="flex flex-grow flex-col bg-base-100 md:rounded-lg">
              <section className="flex flex-grow flex-col items-end w-[90%] mx-auto max-w-[800px] relative">
                <section className="h-[calc(100vh-125px)] w-full md:h-[calc(100vh-151px)] flex flex-col">
                  {children}
                </section>
                <ChatInput userId={session?.user?.id as string} />
              </section>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Template;
