import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { sendEmail } from "@/server/email/send";
import { authSecondaryStorage } from "@/server/http/rate-limit";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  secondaryStorage: authSecondaryStorage,
  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/forget-password": { window: 3600, max: 3 },
      "/send-verification-email": { window: 3600, max: 3 },
    },
  },
  trustedOrigins: [env.APP_URL],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail("reset-password", user.email, { url });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail("verify-email", user.email, { url });
    },
  },
  socialProviders: {
    ...(env.GITHUB_CLIENT_ID && {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET!,
      },
    }),
    ...(env.GOOGLE_CLIENT_ID && {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
      },
    }),
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  plugins: [bearer(), nextCookies()], // username() is added in Step 7.1
});
