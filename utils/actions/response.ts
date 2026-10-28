import "server-only";
import { db } from "../db";
import ActionResponse from "../response";
import { ResponseType } from "@/types/chats";
import { touchWorkspaceActivity } from "@/server/services/workspace";

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
  } catch {
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
 * Asynchronously creates a new response in the database and updates the workspace's activity.
 *
 * @param {string} chatId - The unique identifier for the workspace to which the response belongs.
 * @param {string} question - The question or prompt that was asked.
 * @param {string} response - The response generated.
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

    await touchWorkspaceActivity(chatId);
    return ActionResponse.success("Created response", { res });
  } catch {
    return ActionResponse.error("Failed to create response", null);
  }
};
