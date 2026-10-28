/**
 * @jest-environment node
 */
import { envSchema } from "@/server/env";

describe("server/env validation", () => {
  const baseValidEnv = {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
    BETTER_AUTH_SECRET: "test-auth-secret-min-32-chars-long!",
    GEMINI_API_KEY: "test-gemini-key",
    GEMINI_TEXT_MODEL: "gemini-1.5-flash",
    GEMINI_IMAGE_MODEL: "gemini-1.5-flash",
    RESEND_API_KEY: "re_test_123456789",
    EMAIL_FROM: "onboarding@resend.dev",
    GITHUB_CLIENT_ID: "gh_id",
    GITHUB_CLIENT_SECRET: "gh_secret",
    GOOGLE_CLIENT_ID: "google_id",
    GOOGLE_CLIENT_SECRET: "google_secret",
  };

  it("succeeds and returns typed object with valid env", () => {
    const result = envSchema.safeParse(baseValidEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_URL).toBe("http://localhost:3000");
      expect(result.data.DATABASE_URL).toBe(baseValidEnv.DATABASE_URL);
      expect(result.data.BETTER_AUTH_SECRET).toBe(baseValidEnv.BETTER_AUTH_SECRET);
      expect(result.data.SUPPORT_EMAIL).toBe("support@mail.klecx.vyraxity.com");
    }
  });

  it("accepts a custom SUPPORT_EMAIL when specified", () => {
    const result = envSchema.safeParse({
      ...baseValidEnv,
      SUPPORT_EMAIL: "help@custom.domain.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SUPPORT_EMAIL).toBe("help@custom.domain.com");
    }
  });

  it("fails validation when a required variable is missing, including var name", () => {
    const missingDb = { ...baseValidEnv, DATABASE_URL: undefined };
    const result = envSchema.safeParse(missingDb);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors;
      expect(issues.DATABASE_URL).toBeDefined();
    }
  });

  it("fails validation when APP_URL is not a valid url", () => {
    const invalidUrl = { ...baseValidEnv, APP_URL: "not-a-url" };
    const result = envSchema.safeParse(invalidUrl);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors;
      expect(issues.APP_URL).toBeDefined();
    }
  });

  it("rejects missing Redis credentials in production", () => {
    const prodWithoutRedis = {
      ...baseValidEnv,
      NODE_ENV: "production",
    };
    const result = envSchema.safeParse(prodWithoutRedis);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors;
      expect(issues.UPSTASH_REDIS_REST_URL).toBeDefined();
      expect(issues.UPSTASH_REDIS_REST_TOKEN).toBeDefined();
    }
  });

  it("rejects partially supplied Redis credentials in all environments", () => {
    const urlOnly = {
      ...baseValidEnv,
      NODE_ENV: "development",
      UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io",
    };
    const res1 = envSchema.safeParse(urlOnly);
    expect(res1.success).toBe(false);
    if (!res1.success) {
      expect(
        res1.error.flatten().fieldErrors.UPSTASH_REDIS_REST_TOKEN
      ).toBeDefined();
    }

    const tokenOnly = {
      ...baseValidEnv,
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_TOKEN: "secret-redis-token",
    };
    const res2 = envSchema.safeParse(tokenOnly);
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(
        res2.error.flatten().fieldErrors.UPSTASH_REDIS_REST_URL
      ).toBeDefined();
    }
  });

  it("accepts complete Redis credentials in production", () => {
    const prodWithRedis = {
      ...baseValidEnv,
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "secret-redis-token",
    };
    const result = envSchema.safeParse(prodWithRedis);
    expect(result.success).toBe(true);
  });
});
