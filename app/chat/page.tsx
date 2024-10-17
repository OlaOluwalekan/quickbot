import { auth } from "@/auth";
import TemplatePrompts from "@/components/chats/TemplatePrompts";
import { getTemplatePrompts } from "@/utils/actions/template-prompt";

const ChatPage = async () => {
  // get authenticated user session
  const session = await auth();
  // load template prompts to give user prompt suggestion
  const templateResponse = await getTemplatePrompts();

  // if failed to load template prompts, return error message
  // TODO: add a more user friendly interface when template prompts failed to load
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
