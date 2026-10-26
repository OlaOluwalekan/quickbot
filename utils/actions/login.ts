import "server-only";
import { signIn } from "@/auth";
import ActionResponse from "../response";
import { LoginSchema } from "../schema/auth.shema";
import { getUserByEmailWithPassword } from "./user";
import { AuthError } from "next-auth";

/**
 * Handles user login by validating the provided form data and authenticating the user.
 *
 * @param {FormData} formData - The form data containing user credentials.
 * @returns {Promise<ActionResponse>} - A promise that resolves to an ActionResponse indicating the result of the login attempt.
 */
export const login = async (
  formData: FormData
): Promise<ActionResponse<any>> => {
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || !password) {
    return ActionResponse.error("Invalid email or password", null);
  }

  const parsed = LoginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return ActionResponse.error("Invalid email or password", null);
  }

  const existingUser = await getUserByEmailWithPassword(email as string);

  if (
    !existingUser ||
    !existingUser.email ||
    !existingUser.password ||
    !existingUser.emailVerified
  ) {
    return ActionResponse.error("Invalid email or password", null);
  }

  try {
    await signIn("credentials", { email, password, redirect: false });

    const { password: _p, ...safeUser } = existingUser;
    return ActionResponse.success("Login successful", safeUser);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return ActionResponse.error("Invalid email or password", null);
    }
    return ActionResponse.error("Invalid email or password", null);
  }
};
