import "server-only";
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(), // replaces DOMAIN
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_TEXT_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_IMAGE_MODEL: z.string().default("gemini-nano-banana-2.1"),
  RESEND_API_KEY: z.string().startsWith("re_"),
  EMAIL_FROM: z.string().min(3),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export function validateEnv(input: Record<string, unknown> = process.env) {
  const rawEnv = {
    ...input,
    APP_URL: input.APP_URL || input.DOMAIN,
    BETTER_AUTH_SECRET: input.BETTER_AUTH_SECRET || input.AUTH_SECRET,
  };

  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const formattedErrors = Object.entries(parsed.error.flatten().fieldErrors)
      .map(([key, errors]) => `  - ${key}: ${errors?.join(", ")}`)
      .join("\n");
    console.error(`❌ Invalid environment variables:\n${formattedErrors}\n`);
    throw new Error(`Invalid environment variables:\n${formattedErrors}`);
  }

  return parsed.data;
}

export const env = validateEnv();
