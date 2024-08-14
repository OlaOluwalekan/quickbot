import { auth } from "@/auth";
import TemplatePrompts from "@/components/chats/TemplatePrompts";
import { getGeminiJSONResponse } from "@/utils/ai-models/gemini";

let PROMPT = `List 4 short template prompts for a new chat`;

const ChatPage = async () => {
  const session = await auth();
  const templateResponse = await getGeminiJSONResponse(PROMPT);

  if (!templateResponse.data) {
    return (
      <div className="flex flex-col justify-center items-center h-full w-full">
        Failed to load Prompts
      </div>
    );
  }
  // console.log("TEMP PROMPTS:", templateResponse);
  // console.log(JSON.parse(templateResponse.data.result));

  const templatePrompts = JSON.parse(templateResponse.data.result);

  return (
    <div className="flex flex-col justify-center items-center h-full w-full">
      <TemplatePrompts
        data={templatePrompts}
        userId={session?.user?.id as string}
      />
    </div>
  );
};

export default ChatPage;
