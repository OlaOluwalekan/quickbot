import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 50;

/**
 * Validation messages are next-intl keys (`Auth.validation.*`), translated by
 * `<FormMessage>` with these values for their `{placeholders}`.
 */
export const AUTH_VALIDATION_VALUES = {
  min: PASSWORD_MIN_LENGTH,
  max: PASSWORD_MAX_LENGTH,
  nameMin: NAME_MIN_LENGTH,
  nameMax: NAME_MAX_LENGTH,
};

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: "Auth.validation.passwordTooShort" })
  .max(PASSWORD_MAX_LENGTH, { message: "Auth.validation.passwordTooLong" });

export const RegisterSchema = z
  .object({
    email: z.string().trim().email({ message: "Auth.validation.invalidEmail" }),
    name: z
      .string()
      .trim()
      .min(NAME_MIN_LENGTH, { message: "Auth.validation.nameLength" })
      .max(NAME_MAX_LENGTH, { message: "Auth.validation.nameLength" }),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Auth.validation.passwordsDoNotMatch",
    path: ["confirmPassword"],
  });

export const LoginSchema = z.object({
  email: z.string().trim().email({ message: "Auth.validation.invalidEmail" }),
  password: z.string().min(1, { message: "Auth.validation.passwordRequired" }),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
