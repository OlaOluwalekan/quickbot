import { getActor } from "@/server/auth/session";
import ResponseList from "@/components/chats/ResponseList";
import ChatInput from "@/components/chats/ChatInput";
import NotFound from "@/components/not-found/NotFound";
import { getWorkspace } from "@/server/services/workspace";
import { getResponses } from "@/utils/actions/response";

const SingleWorkspacePage = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const actor = await getActor();
  if (!actor) {
    return <NotFound />;
  }

  const workspaceId = (await params).id;

  try {
    await getWorkspace(actor, workspaceId);
  } catch {
    return <NotFound />;
  }

  const responsesRes = await getResponses(workspaceId);
  const responses = responsesRes.data?.responses || [];

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full h-full overflow-hidden">
      <ResponseList
        data={responses}
        image={(actor?.image ?? null) as string | null}
      />
      <ChatInput userId={actor.userId} />
    </div>
  );
};

export default SingleWorkspacePage;
