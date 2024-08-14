import { auth } from "@/auth";
import ResponseList from "@/components/chats/ResponseList";
import { getResponses } from "@/utils/actions/response";
import Link from "next/link";
import React from "react";

const SingleChatPage = async ({ params }: { params: { chatId: string } }) => {
  const session = await auth();
  const responsesRes = await getResponses(params.chatId);
  const responses = responsesRes.data.responses;

  if (!responses || responses.length === 0) {
    return (
      <div className="w-full h-full flex flex-col gap-4 justify-center items-center">
        No Response from Quickbot
        <Link
          href="/chat"
          className="bg-primary text-primary-content px-5 py-2"
        >
          New Chat
        </Link>
      </div>
    );
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
