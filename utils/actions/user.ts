"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import ActionResponse from "../response";

export const getUserByEmail = async (email: string) => {
  try {
    const user = await db.user.findUnique({ where: { email } });

    return user;
  } catch (error) {
    return null;
  }
};

export const getUserById = async (id: string) => {
  try {
    const user = await db.user.findUnique({ where: { id } });
    return user;
  } catch (error) {
    return null;
  }
};

export const updateUserName = async (formData: FormData) => {
  const name = formData.get("name");
  const id = formData.get("id");

  try {
    const updatedUser = await db.user.update({
      where: {
        id: id as string,
      },
      data: {
        name: name as string,
      },
    });
    revalidatePath("/settings");
    return ActionResponse.success("Name updated", updatedUser);
  } catch (error) {
    return ActionResponse.error("Filed to update name", null);
  }
};
