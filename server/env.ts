import "server-only";
import { z } from "zod";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url(), // replaces DOMAIN
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    GEMINI_API_KEY: z.string().min(10),
    GEMINI_TEXT_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_TEXT_MODEL_ECONOMY: z.string().default("gemini-2.5-flash"),
    GEMINI_TEXT_MODEL_STANDARD: z.string().default("gemini-2.5-pro"),
    GEMINI_IMAGE_MODEL: z.string().default("imagen-3.0-generate-002"),
    RESEND_API_KEY: z.string().startsWith("re_"),
    EMAIL_FROM: z.string().min(3),
    SUPPORT_EMAIL: emptyToUndefined(z.string().min(3).optional()),
    PRIVACY_EMAIL: emptyToUndefined(z.string().min(3).optional()),
    ABUSE_EMAIL: emptyToUndefined(z.string().min(3).optional()),
    LEGAL_EMAIL: emptyToUndefined(z.string().min(3).optional()),
    BILLING_EMAIL: emptyToUndefined(z.string().min(3).optional()),
    COMPANY_LEGAL_NAME: emptyToUndefined(z.string().min(1).optional()),
    COMPANY_ADDRESS: emptyToUndefined(z.string().min(1).optional()),
    COMPANY_COUNTRY: emptyToUndefined(z.string().min(2).optional()),
    COMPANY_REG_NUMBER: emptyToUndefined(z.string().min(1).optional()),
    COMPANY_WEBSITE: emptyToUndefined(z.string().url().optional()),
    SOCIAL_X_URL: emptyToUndefined(z.string().url().optional()),
    SOCIAL_GITHUB_URL: emptyToUndefined(z.string().url().optional()),
    BILLING_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    UPSTASH_REDIS_REST_URL: emptyToUndefined(z.string().url().optional()),
    UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(z.string().min(1).optional()),
    CLOUDINARY_CLOUD_NAME: emptyToUndefined(z.string().optional()),
    CLOUDINARY_API_KEY: emptyToUndefined(z.string().optional()),
    CLOUDINARY_API_SECRET: emptyToUndefined(z.string().optional()),
    CLOUDINARY_UPLOAD_FOLDER: z.string().default("klecx/dev"),
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: emptyToUndefined(z.string().optional()),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    DEV_DEFAULT_PLAN: emptyToUndefined(
      z.enum(["FREE", "LITE", "STANDARD", "PRO"]).optional()
    ),
  })
  .superRefine((data, ctx) => {
    const hasRedisUrl = Boolean(data.UPSTASH_REDIS_REST_URL);
    const hasRedisToken = Boolean(data.UPSTASH_REDIS_REST_TOKEN);

    if (hasRedisUrl !== hasRedisToken) {
      if (!hasRedisUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPSTASH_REDIS_REST_URL"],
          message:
            "UPSTASH_REDIS_REST_URL is required when UPSTASH_REDIS_REST_TOKEN is set",
        });
      }
      if (!hasRedisToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPSTASH_REDIS_REST_TOKEN"],
          message:
            "UPSTASH_REDIS_REST_TOKEN is required when UPSTASH_REDIS_REST_URL is set",
        });
      }
      return;
    }

    if (data.NODE_ENV === "production") {
      if (!hasRedisUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPSTASH_REDIS_REST_URL"],
          message: "UPSTASH_REDIS_REST_URL is required in production",
        });
      }
      if (!hasRedisToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["UPSTASH_REDIS_REST_TOKEN"],
          message: "UPSTASH_REDIS_REST_TOKEN is required in production",
        });
      }

      const requiredInProd: Array<keyof typeof data> = [
        "SUPPORT_EMAIL",
        "PRIVACY_EMAIL",
        "ABUSE_EMAIL",
        "COMPANY_LEGAL_NAME",
        "COMPANY_ADDRESS",
        "COMPANY_COUNTRY",
      ];
      for (const field of requiredInProd) {
        if (!data[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${String(field)} is required in production`,
          });
        }
      }
    }

    const hasCloudinaryName = Boolean(data.CLOUDINARY_CLOUD_NAME);
    const hasCloudinaryKey = Boolean(data.CLOUDINARY_API_KEY);
    const hasCloudinarySecret = Boolean(data.CLOUDINARY_API_SECRET);
    if (
      (hasCloudinaryName || hasCloudinaryKey || hasCloudinarySecret) &&
      !(hasCloudinaryName && hasCloudinaryKey && hasCloudinarySecret)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLOUDINARY_CLOUD_NAME"],
        message:
          "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must all be set together",
      });
    }
  })
  .transform((data) => {
    const supportEmail = data.SUPPORT_EMAIL || "support@example.test";
    const privacyEmail = data.PRIVACY_EMAIL || "privacy@example.test";
    const abuseEmail = data.ABUSE_EMAIL || "abuse@example.test";
    const legalEmail = data.LEGAL_EMAIL || supportEmail;
    const billingEmail = data.BILLING_EMAIL || supportEmail;

    return {
      ...data,
      SUPPORT_EMAIL: supportEmail,
      PRIVACY_EMAIL: privacyEmail,
      ABUSE_EMAIL: abuseEmail,
      LEGAL_EMAIL: legalEmail,
      BILLING_EMAIL: billingEmail,
      COMPANY_LEGAL_NAME: data.COMPANY_LEGAL_NAME || "Vyraxity",
      COMPANY_ADDRESS: data.COMPANY_ADDRESS || "Lagos, Nigeria",
      COMPANY_COUNTRY: data.COMPANY_COUNTRY || "NG",
      COMPANY_WEBSITE: data.COMPANY_WEBSITE || "https://vyraxity.com",
    };
  });

export function validateEnv(input: Record<string, unknown> = process.env) {
  const isNextProductionBuildPhase =
    input === process.env &&
    process.env.NEXT_PHASE === "phase-production-build" &&
    !input.UPSTASH_REDIS_REST_URL &&
    !input.UPSTASH_REDIS_REST_TOKEN;

  const rawEnv = {
    ...input,
    // During `next build` (static page data collection), allow local builds without
    // Redis credentials to validate as development unless Redis vars are supplied.
    // At production runtime (`next start` / serverless invocation), NODE_ENV="production"
    // strictly requires both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
    NODE_ENV: isNextProductionBuildPhase ? "development" : input.NODE_ENV,
    APP_URL: input.APP_URL || input.DOMAIN,
    BETTER_AUTH_SECRET: input.BETTER_AUTH_SECRET || input.AUTH_SECRET,
    GEMINI_TEXT_MODEL:
      input.GEMINI_TEXT_MODEL || input.GEMINI_TEXT_MODEL_ECONOMY || undefined,
    GEMINI_TEXT_MODEL_ECONOMY:
      input.GEMINI_TEXT_MODEL_ECONOMY || input.GEMINI_TEXT_MODEL || undefined,
    GEMINI_TEXT_MODEL_STANDARD: input.GEMINI_TEXT_MODEL_STANDARD || undefined,
    GEMINI_IMAGE_MODEL: input.GEMINI_IMAGE_MODEL || undefined,
    SUPPORT_EMAIL: input.SUPPORT_EMAIL || undefined,
    PRIVACY_EMAIL: input.PRIVACY_EMAIL || undefined,
    ABUSE_EMAIL: input.ABUSE_EMAIL || undefined,
    LEGAL_EMAIL: input.LEGAL_EMAIL || undefined,
    BILLING_EMAIL: input.BILLING_EMAIL || undefined,
    COMPANY_LEGAL_NAME: input.COMPANY_LEGAL_NAME || undefined,
    COMPANY_ADDRESS: input.COMPANY_ADDRESS || undefined,
    COMPANY_COUNTRY: input.COMPANY_COUNTRY || undefined,
    COMPANY_REG_NUMBER: input.COMPANY_REG_NUMBER || undefined,
    COMPANY_WEBSITE: input.COMPANY_WEBSITE || undefined,
    SOCIAL_X_URL: input.SOCIAL_X_URL || undefined,
    SOCIAL_GITHUB_URL: input.SOCIAL_GITHUB_URL || undefined,
    BILLING_ENABLED:
      input.BILLING_ENABLED === undefined || input.BILLING_ENABLED === ""
        ? undefined
        : typeof input.BILLING_ENABLED === "boolean"
          ? String(input.BILLING_ENABLED)
          : input.BILLING_ENABLED,
    UPSTASH_REDIS_REST_URL: input.UPSTASH_REDIS_REST_URL || undefined,
    UPSTASH_REDIS_REST_TOKEN: input.UPSTASH_REDIS_REST_TOKEN || undefined,
    CLOUDINARY_CLOUD_NAME: input.CLOUDINARY_CLOUD_NAME || undefined,
    CLOUDINARY_API_KEY: input.CLOUDINARY_API_KEY || undefined,
    CLOUDINARY_API_SECRET: input.CLOUDINARY_API_SECRET || undefined,
    CLOUDINARY_UPLOAD_FOLDER: input.CLOUDINARY_UPLOAD_FOLDER || "klecx/dev",
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
      input.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
      input.CLOUDINARY_CLOUD_NAME ||
      undefined,
    TRUST_PROXY:
      input.TRUST_PROXY === undefined || input.TRUST_PROXY === ""
        ? undefined
        : typeof input.TRUST_PROXY === "boolean"
          ? String(input.TRUST_PROXY)
          : input.TRUST_PROXY,
    DEV_DEFAULT_PLAN: input.DEV_DEFAULT_PLAN || undefined,
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
