"use server";

import { revalidatePath } from "next/cache";
import { getGeminiChatResponse, getGeminiResponse } from "../ai-models/gemini";
import { db } from "../db";
import ActionResponse from "../response";
import { createChat } from "./chat";

export const getResponseFromAI = async (formData: FormData, page: string) => {
  const prompt = formData.get("question");
  const id = formData.get("id");

  let chatId: string = "";
  let history: any[] = [];

  if (!prompt) {
    return ActionResponse.error("Prompt is required", null);
  }

  if (page === "/chat") {
    const chatResponse = await createChat(id as string, prompt as string);
    chatId = chatResponse.data.chatId;
  } else {
    chatId = page.split("/").pop() as string;
    const responsesResponse = await getResponses(chatId);
    const responses = responsesResponse.data.responses;

    responses.forEach((response: any) => {
      let first = {
        role: "user",
        parts: [{ text: response.question }],
      };
      let second = {
        role: "model",
        parts: [{ text: response.response }],
      };
      history.push(first, second);
    });
  }

  try {
    const response = await getGeminiChatResponse(prompt as string, history);
    await createResponse(chatId, prompt as string, response.data.text);
    revalidatePath("/chat");
    revalidatePath(`/chat/${chatId}`);
    return ActionResponse.success("responded", {
      text: response.data.text,
      chatId,
    });
  } catch (error) {
    return ActionResponse.error("failed to respond", { error });
  }
};

export const getResponses = async (chatId: string) => {
  try {
    const responses = await db.response.findMany({
      where: {
        chatId: chatId,
      },
    });
    return ActionResponse.success("Fetched responses", { responses });
  } catch (error) {
    return ActionResponse.error("Failed to fetch responses", null);
  }
};

const createResponse = async (
  chatId: string,
  question: string,
  response: string
) => {
  try {
    await db.response.create({
      data: {
        chatId,
        question,
        response,
      },
    });

    await db.chat.update({
      where: {
        id: chatId,
      },
      data: {
        updatedAt: new Date(),
      },
    });
    return ActionResponse.success("Created response", null);
  } catch (error) {
    return ActionResponse.error("Failed to create response", null);
  }
};
