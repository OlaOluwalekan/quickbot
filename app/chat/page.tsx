import { auth } from "@/auth";
import TemplatePrompts from "@/components/chats/TemplatePrompts";
import { getTemplatePrompts } from "@/utils/actions/template-prompt";

const ChatPage = async () => {
  const session = await auth();
  const templateResponse = await getTemplatePrompts();

  if (!templateResponse.data) {
    return (
      <div className="flex flex-col justify-center items-center h-full w-full">
        Failed to load Prompts
      </div>
    );
  }

  const templatePrompts = templateResponse.data.templatePrompts;

  return (
    <div className="flex flex-col justify-center items-center h-full w-full">
      <TemplatePrompts
        data={templatePrompts}
        userId={session?.user?.id as string}
        existingToken={(session?.user as any).token}
      />
    </div>
  );
};

export default ChatPage;
