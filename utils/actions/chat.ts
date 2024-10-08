"use server";

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

export const getChatById = async (chatId: string) => {
  try {
    const chat = await db.chat.findUnique({
      where: {
        id: chatId,
      },
    });

    // console.log("UNAUTHORIZED", chat?.createdBy, userId);

    // if (chat?.createdBy !== userId) {
    //   return ActionResponse.error("Unauthorized", null);
    // }

    return ActionResponse.success("Chat retrieved successfully", { chat });
  } catch (error) {
    return ActionResponse.error("Failed to retrieve chat", null);
  }
};

export const updateChatTitle = async (chatId: string, title: string) => {
  try {
    const updatedChat = await db.chat.update({
      where: {
        id: chatId,
      },
      data: {
        title,
      },
    });
    revalidatePath("/chat");
    return ActionResponse.success("Chat title updated successfully", {
      updatedChat,
    });
  } catch (error) {
    return ActionResponse.error("Failed to update chat title", null);
  }
};

export const deleteChat = async (chatId: string) => {
  try {
    await db.chat.delete({
      where: {
        id: chatId,
      },
    });
    revalidatePath("/chat");
    return ActionResponse.success("Chat deleted successfully", null);
  } catch (error) {
    return ActionResponse.error("Failed to delete chat", null);
  }
};
