import { auth } from "@/auth";
import ResponseList from "@/components/chats/ResponseList";
import { getResponses } from "@/utils/actions/response";
import React from "react";

const SingleChatPage = async ({ params }: { params: { chatId: string } }) => {
  const session = await auth();
  const responsesRes = await getResponses(params.chatId);
  const responses = responsesRes.data.responses;

  return (
    <div className="h-full">
      <ResponseList
        data={responses}
        image={session?.user?.image as string | null}
      />
    </div>
  );
};

export default SingleChatPage;
