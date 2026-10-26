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
});
