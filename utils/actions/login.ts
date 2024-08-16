"use server";

import { signIn } from "@/auth";
import ActionResponse from "../response";
import { LoginSchema } from "../schema/auth.shema";
import { getUserByEmail } from "./user";
import { AuthError } from "next-auth";

export const login = async (formData: FormData) => {
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email) {
    return ActionResponse.error("email is required", null);
  }

  if (!password) {
    return ActionResponse.error("password is required", null);
  }

  const existingUser = await getUserByEmail(email as string);

  if (!existingUser || !existingUser.email) {
    return ActionResponse.error("User does not exist", null);
  }

  if (!existingUser.password) {
    return ActionResponse.error(
      "This account uses a different login method",
      existingUser
    );
  }
  if (!existingUser?.emailVerified) {
    return ActionResponse.error("Email is not verified", existingUser);
  }

  try {
    LoginSchema.safeParse({ email, password });

    await signIn("credentials", { email, password, redirect: false });

    return ActionResponse.success("Login successful", existingUser);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return ActionResponse.error(JSON.parse(error?.message)[0].message, null);
    }
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return ActionResponse.error("Invalid credentials", null);
        default:
          return ActionResponse.error("An error occurred", null);
      }
    }

    throw error;
  }
};
