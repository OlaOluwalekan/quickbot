"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import ActionResponse from "../response";

/**
 * Retrieves a user from the database by their email address.
 *
 * @param {string} email - The email address of the user to retrieve.
 * @returns The user object if found, otherwise null if an error occurs or the user is not found.
 */
export const getUserByEmail = async (email: string) => {
  try {
    const user = await db.user.findUnique({ where: { email } });

    return user;
  } catch (error) {
    return null;
  }
};

/**
 * Retrieves a user from the database by their unique identifier.
 *
 * @param {string} id - The unique identifier of the user to retrieve.
 * @returns The user object if found, otherwise null if an error occurs or the user is not found.
 */
export const getUserById = async (id: string) => {
  try {
    const user = await db.user.findUnique({ where: { id } });

    return user;
  } catch (error) {
    return null;
  }
};

/**
 * Updates the user's name in the database and re-validates the settings path.
 *
 * @param formData - The form data containing the user's new name and id.
 * @returns A success response with the updated user data if successful,
 *          otherwise an error response.
 */
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
