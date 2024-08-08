"use server";

import { db } from "../db";

export const getUserByEmail = async (email: string) => {
  try {
    const user = await db.user.findUnique({ where: { email } });
    // console.log("DB USER:", user);

    return user;
  } catch (error) {
    return null;
  }
};
