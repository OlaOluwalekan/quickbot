jest.mock("server-only", () => {});

import { signMobileToken, verifyMobileToken } from "@/utils/api-auth";
import { safeUserSelect } from "@/utils/actions/user";

describe("Security: Auth & Token API Security", () => {
  const originalSecret = process.env.AUTH_SECRET;

  beforeAll(() => {
    process.env.AUTH_SECRET =
      originalSecret && originalSecret.length >= 32
        ? originalSecret
        : "test-auth-secret-key-32-characters-minimum";
  });

  afterAll(() => {
    process.env.AUTH_SECRET = originalSecret;
  });

  test("throws error when AUTH_SECRET is missing or less than 32 chars", () => {
    expect(() => {
      delete process.env.AUTH_SECRET;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../../utils/api-auth");
      });
    }).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = "test-auth-secret-key-32-characters-minimum";
  });

  test("server/env throws with readable list of missing variables", () => {
    expect(() => {
      const origDb = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../../server/env");
        });
      } finally {
        process.env.DATABASE_URL = origDb;
      }
    }).toThrow(/DATABASE_URL/);
  });

  test("safeUserSelect must NEVER include password", () => {
    expect((safeUserSelect as any).password).toBeUndefined();
    expect(safeUserSelect).toHaveProperty("id");
    expect(safeUserSelect).toHaveProperty("email");
    expect(safeUserSelect).toHaveProperty("tokens");
    expect(safeUserSelect).toHaveProperty("role");
  });

  test("mobile tokens with non-HS256 algorithms are rejected", () => {
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" })
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "user-123",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString("base64url");
    const forgedToken = `${header}.${payload}.invalidsig`;

    expect(verifyMobileToken(forgedToken)).toBeNull();
  });

  test("tampered signatures are rejected using timing-safe check", () => {
    const validToken = signMobileToken({
      id: "user-456",
      email: "user@example.com",
      role: "USER",
    });

    const parts = validToken.split(".");
    const tamperedToken = `${parts[0]}.${parts[1]}.tamperedSignatureHere`;
    expect(verifyMobileToken(tamperedToken)).toBeNull();
  });

  test("valid mobile tokens verify and return decoded payload", () => {
    const token = signMobileToken({
      id: "user-789",
      email: "verified@example.com",
      role: "USER",
    });

    const payload = verifyMobileToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-789");
    expect(payload?.email).toBe("verified@example.com");
  });
});
