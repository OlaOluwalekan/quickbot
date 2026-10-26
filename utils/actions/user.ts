import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import ActionResponse from "../response";

export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  emailVerified: true,
  role: true,
  tokens: true,
} as const;

export type SafeUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  emailVerified: Date | null;
  role: string;
  tokens: number;
};

/**
 * Retrieves a user from the database by their email address with safe fields (no password).
 */
export const getUserByEmail = async (email: string): Promise<SafeUser | null> => {
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: safeUserSelect,
    });

    return user;
  } catch {
    return null;
  }
};

/**
 * Retrieves a user for authentication purposes (internal only, used by auth.ts authorize).
 */
export const getUserByEmailWithPassword = async (email: string) => {
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        ...safeUserSelect,
        password: true,
      },
    });

    return user;
  } catch {
    return null;
  }
};

/**
 * Retrieves a user from the database by their unique identifier with safe fields (no password).
 */
export const getUserById = async (id: string): Promise<SafeUser | null> => {
  try {
    const user = await db.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });

    return user;
  } catch {
    return null;
  }
};

/**
 * Updates the user's name in the database and re-validates the settings path.
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
      select: safeUserSelect,
    });
    revalidatePath("/settings");
    return ActionResponse.success("Name updated", updatedUser);
  } catch {
    return ActionResponse.error("Failed to update name", null);
  }
};
