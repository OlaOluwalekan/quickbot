"use server";

import { db } from "../db";

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
