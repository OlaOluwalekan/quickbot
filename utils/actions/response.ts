"use server";

import { revalidatePath } from "next/cache";
import { getGeminiChatResponse } from "../ai-models/gemini";
import { db } from "../db";
import ActionResponse from "../response";
import { createChat } from "./chat";
import { createTokenUsage, updateUserToken } from "./response-token";
import { ResponseType } from "@/types/chats";

/**
 * Asynchronously retrieves a response from the Gemini Interactions API based on the provided form data and page context.
 *
 * @param {FormData} formData - The form data containing the user's question and user id.
 * @param {string} page - The current page context, used to determine the chat or response flow.
 * @param {number} existingToken - The number of tokens available for the user, used to validate token usage.
 *
 * @returns {Promise<ActionResponse<any>>}
 */
export const getResponseFromAI = async (
  formData: FormData,
  page: string,
  existingToken: number
): Promise<ActionResponse<any>> => {
  const prompt = formData.get("question");
  const id = formData.get("id");

  let chatId: string = "";
  let history: any[] = [];
  let previousInteractionId: string | null = null;

  if (!prompt) {
    return ActionResponse.error("Prompt is required", null);
  }

  if (existingToken <= 0) {
    return ActionResponse.error("You are out of token, Please purchase", null);
  }

  if (page === "/chat") {
    const chatResponse = await createChat(id as string, prompt as string);
    if (!chatResponse.success || !chatResponse.data?.chatId) {
      return ActionResponse.error("Failed to create chat", null);
    }
    chatId = chatResponse.data.chatId;
  } else {
    chatId = page.split("/").pop() as string;
    const responsesResponse = await getResponses(chatId);
    const responses = responsesResponse.data?.responses || [];

    if (responses.length > 0) {
      const lastWithInteraction = [...responses]
        .reverse()
        .find((r: any) => Boolean(r.interactionId));
      previousInteractionId = lastWithInteraction?.interactionId || null;

      responses.forEach((response: any) => {
        history.push(
          {
            role: "user",
            parts: [{ text: response.question }],
          },
          {
            role: "model",
            parts: [{ text: response.response }],
          }
        );
      });
    }
  }

  try {
    const response = await getGeminiChatResponse(
      prompt as string,
      history,
      previousInteractionId
    );

    if (!response.success || !response.data) {
      return ActionResponse.error("failed to respond", null);
    }

    const res = await createResponse(
      chatId,
      prompt as string,
      response.data.text,
      {
        type: "TEXT",
        interactionId: response.data.interactionId,
      }
    );

    const tokenUsed: number = response.data.tokenCount || 0;
    if (res.data?.res?.id) {
      await createTokenUsage(id as string, tokenUsed, res.data.res.id);
    }
    await updateUserToken(
      id as string,
      Math.max(0, existingToken - tokenUsed)
    );
    revalidatePath("/chat");
    revalidatePath(`/chat/${chatId}`);
    return ActionResponse.success("responded", {
      text: response.data.text,
      chatId,
      response: res.data?.res,
    });
  } catch (error) {
    return ActionResponse.error("failed to respond", { error });
  }
};

/**
 * Asynchronously retrieves responses from the database for a given chat ID ordered chronologically.
 *
 * @param {string} chatId - The unique identifier for the chat whose responses are to be fetched.
 * @returns {Promise<ActionResponse<any>>}
 */
export const getResponses = async (
  chatId: string
): Promise<ActionResponse<any>> => {
  try {
    const responses = await db.response.findMany({
      where: {
        chatId: chatId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    return ActionResponse.success("Fetched responses", { responses });
  } catch (error) {
    return ActionResponse.error("Failed to fetch responses", null);
  }
};

export interface CreateResponseOptions {
  type?: ResponseType;
  imageUrl?: string | null;
  mimeType?: string | null;
  interactionId?: string | null;
}

/**
 * Asynchronously creates a new response in the database and updates the chat's last updated timestamp.
 *
 * @param {string} chatId - The unique identifier for the chat to which the response belongs.
 * @param {string} question - The question or prompt that was asked in the chat.
 * @param {string} response - The response generated for the given question.
 * @param {CreateResponseOptions} [options] - Optional metadata (type, imageUrl, mimeType, interactionId).
 * @returns {Promise<ActionResponse<any>>}
 */
export const createResponse = async (
  chatId: string,
  question: string,
  response: string,
  options?: CreateResponseOptions
): Promise<ActionResponse<any>> => {
  try {
    const res = await db.response.create({
      data: {
        chatId,
        question,
        response,
        type: options?.type || "TEXT",
        imageUrl: options?.imageUrl ?? null,
        mimeType: options?.mimeType ?? null,
        interactionId: options?.interactionId ?? null,
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
    return ActionResponse.success("Created response", { res });
  } catch (error) {
    return ActionResponse.error("Failed to create response", null);
  }
};
