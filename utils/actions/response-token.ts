"use server";

import { db } from "../db";

/**
 * Retrieves the token usage records for a specific user, ordered by the most recent usage.
 *
 * @param userId - The unique identifier of the user whose token usage is to be retrieved.
 * @returns A promise that resolves to an array of token usage records if successful, or null if an error occurs.
 */
export const getTokenUsageByUserId = async (userId: string) => {
  try {
    const response = await db.tokenUsage.findMany({
      where: {
        userId,
      },
      orderBy: {
        usedAt: "desc",
      },
    });
    return response;
  } catch (error) {
    return null;
  }
};

/**
 * Updates the token count for a specific user in the database.
 *
 * @param userId - The unique identifier of the user whose token count is to be updated.
 * @param token - The new token count to be set for the user.
 * @returns A promise that resolves to the updated user object if successful, or null if an error occurs.
 */
export const updateUserToken = async (userId: string, token: number) => {
  try {
    const updatedUser = await db.user.update({
      where: {
        id: userId,
      },
      data: {
        tokens: token,
      },
    });
    return updatedUser;
  } catch (error) {
    return null;
  }
};

/**
 * Creates a new token usage record in the database.
 *
 * @param userId - The unique identifier of the user for whom the token usage is being recorded.
 * @param token - The number of tokens used.
 * @param responseId - The unique identifier of the response associated with this token usage.
 * @returns A promise that resolves to the created token usage record if successful, or null if an error occurs.
 */
export const createTokenUsage = async (
  userId: string,
  token: number,
  responseId: string
) => {
  try {
    const tokenUsage = await db.tokenUsage.create({
      data: {
        userId,
        token,
        responseId,
      },
    });
    return tokenUsage;
  } catch (error) {
    return null;
  }
};
