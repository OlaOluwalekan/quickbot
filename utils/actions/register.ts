"use server";

import ActionResponse from "../response";

export const register = async (formData: FormData) => {
  const email = formData.get("email");
  const name = formData.get("name");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (!email) {
    return ActionResponse.error("Email is required", null);
  }
  if (!name) {
    return ActionResponse.error("Name is required", null);
  }
  if (!password) {
    return ActionResponse.error("Password is required", null);
  }

  return ActionResponse.success("Registration successful", {
    email,
    name,
    password,
    confirmPassword,
  });
};
