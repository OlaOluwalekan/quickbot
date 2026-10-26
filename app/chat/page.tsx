import { getActor } from "@/server/auth/session";
import TemplatePrompts from "@/components/chats/TemplatePrompts";

const ChatPage = async () => {
  const actor = await getActor();

  const samplePrompts = [
    {
      name: "What is the weather like today?",
      domain: "weather",
    },
    {
      name: "Tell me a joke",
      domain: "general",
    },
    {
      name: "What is the capital of France?",
      domain: "geography",
    },
    {
      name: "How do I make a cake?",
      domain: "cooking",
    },
  ];

  return (
    <div className="flex h-full w-full scrollbar-none flex-col items-center justify-center overflow-auto">
      <TemplatePrompts
        data={samplePrompts}
        userId={(actor?.userId ?? "") as string}
      />
    </div>
  );
};

export default ChatPage;
