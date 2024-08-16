import { auth } from "@/auth";
import ResponseList from "@/components/chats/ResponseList";
import NotFound from "@/components/not-found/NotFound";
import { getResponses } from "@/utils/actions/response";
import Link from "next/link";
import React from "react";

const SingleChatPage = async ({ params }: { params: { chatId: string } }) => {
  const session = await auth();
  const responsesRes = await getResponses(params.chatId);
  const responses = responsesRes.data.responses;

  if (!responses || responses.length === 0) {
    return <NotFound />;
  }

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
