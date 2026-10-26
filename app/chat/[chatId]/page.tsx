import { getActor } from "@/server/auth/session";
import ResponseList from "@/components/chats/ResponseList";
import NotFound from "@/components/not-found/NotFound";
import { getChatById } from "@/utils/actions/chat";
import { getResponses } from "@/utils/actions/response";

const SingleChatPage = async ({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) => {
  const actor = await getActor();
  const chatId = (await params).chatId;

  const responsesRes = await getResponses(chatId);

  if (!responsesRes.data) {
    return <NotFound />;
  }

  const responses = responsesRes.data.responses;

  if (!responses || responses.length === 0) {
    return <NotFound />;
  }

  const chatResponse = await getChatById(responses[0].chatId);
  const chat = chatResponse.data.chat;

  if (!chat || chat.createdBy !== actor?.userId) {
    return <NotFound />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden">
      <ResponseList
        data={responses}
        image={(actor?.image ?? null) as string | null}
      />
    </div>
  );
};

export default SingleChatPage;
