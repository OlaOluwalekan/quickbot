import { revalidatePath } from "next/cache";
import { getGeminiResponse } from "../ai-models/gemini";
import { db } from "../db";
import ActionResponse from "../response";

export const createChat = async (userId: string, prompt: string) => {
  const aiResponse = await getGeminiResponse(
    `In plain text and in a single line, without any formatting, give a title to the the text "${prompt}" in 60 characters maximum`
  );

  try {
    const chatResponse = await db.chat.create({
      data: {
        title: aiResponse.data.text,
        createdBy: userId,
      },
    });
    revalidatePath("/chat");
    return ActionResponse.success("Chat created successfully", {
      chatId: chatResponse.id,
    });
  } catch (error) {
    return ActionResponse.error("Failed to create chat", { error });
  }
};

export const getChats = async (userId: string) => {
  try {
    const chats = await db.chat.findMany({
      where: {
        createdBy: userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    return ActionResponse.success("Chats retrieved successfully", { chats });
  } catch (error) {
    return ActionResponse.error("Failed to retrieve chats", null);
  }
};
