"use server";

import { revalidatePath } from "next/cache";
import { getGeminiResponse } from "../ai-models/gemini";
import { db } from "../db";
import ActionResponse from "../response";

/**
 * Creates a new chat entry in the database with a title generated by AI.
 *
 * @param {string} userId - The ID of the user creating the chat.
 * @param {string} prompt - The prompt text used to generate the chat title.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse indicating success or failure.
 *
 * @throws {Error} Throws an error if the chat creation fails.
 */
export const createChat = async (
  userId: string,
  prompt: string
): Promise<ActionResponse<any>> => {
  // get the response from gemini api
  const aiResponse = await getGeminiResponse(
    `In plain text and in a single line, without any formatting, give a title to the the text "${prompt}" in 60 characters maximum`
  );

  try {
    // create chat and add the generated ai response to the database
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

/**
 * Retrieves a list of chat entries from the database for a specific user.
 *
 * @param {string} userId - The ID of the user whose chats are to be retrieved.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse indicating success or failure, with the list of chats if successful.
 *
 * @throws {Error} Throws an error if the chat retrieval fails.
 */
export const getChats = async (
  userId: string
): Promise<ActionResponse<any>> => {
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

/**
 * Retrieves a chat entry from the database by its unique identifier.
 *
 * @param {string} chatId - The unique identifier of the chat to be retrieved.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse indicating success or failure, with the chat data if successful.
 *
 * @throws {Error} Throws an error if the chat retrieval fails.
 */
export const getChatById = async (
  chatId: string
): Promise<ActionResponse<any>> => {
  try {
    const chat = await db.chat.findUnique({
      where: {
        id: chatId,
      },
    });

    return ActionResponse.success("Chat retrieved successfully", { chat });
  } catch (error) {
    return ActionResponse.error("Failed to retrieve chat", null);
  }
};

/**
 * Updates the title of an existing chat entry in the database.
 *
 * @param {string} chatId - The ID of the chat to be updated.
 * @param {string} title - The new title for the chat.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse indicating success or failure, with the updated chat if successful.
 *
 * @throws {Error} Throws an error if the chat title update fails.
 */
export const updateChatTitle = async (
  chatId: string,
  title: string
): Promise<ActionResponse<any>> => {
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

/**
 * Deletes a chat entry from the database.
 *
 * @param {string} chatId - The ID of the chat to be deleted.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse indicating success or failure.
 *
 * @throws {Error} Throws an error if the chat deletion fails.
 */
export const deleteChat = async (
  chatId: string
): Promise<ActionResponse<any>> => {
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
