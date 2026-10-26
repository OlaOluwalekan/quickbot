/**
 * @jest-environment node
 */

jest.mock("server-only", () => {});
jest.mock("../../auth", () => ({
  signIn: jest.fn(),
  auth: jest.fn(),
}));
jest.mock("../../utils/db", () => ({
  db: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    verificationToken: {
      findFirst: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
  },
}));
jest.mock("../../utils/emails/send-verification-email", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
}));

import { POST as registerHandler } from "../../app/api/auth/register/route";
import { POST as resendHandler } from "../../app/api/auth/resend-verification/route";
import { POST as loginHandler } from "../../app/api/auth/login/route";
import { db } from "../../utils/db";
import bcrypt from "bcryptjs";

describe("Security: API Route Response Leak Prevention", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-auth-secret-key-32-characters-minimum";
  });

  test("register route NEVER leaks verification token or password hash", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);
    (db.user.create as jest.Mock).mockResolvedValue({
      id: "new-user-123",
      email: "newuser@example.com",
      name: "New User",
      password: "$2a$10$hashedPasswordThatMustNeverBeReturned",
    });
    (db.verificationToken.create as jest.Mock).mockResolvedValue({
      id: "vt-1",
      email: "newuser@example.com",
      token: "secret-token-12345",
      expires: new Date(),
    });

    const req = {
      json: async () => ({
        email: "newuser@example.com",
        name: "New User",
        password: "ValidPassword123!",
        confirmPassword: "ValidPassword123!",
      }),
    } as any;

    const res = await registerHandler(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("new-user-123");
    expect(body.data.email).toBe("newuser@example.com");

    // CRITICAL: Token and password must NOT be in the response
    expect(body.data.token).toBeUndefined();
    expect(body.data.password).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret-token-12345");
    expect(JSON.stringify(body)).not.toContain("hashedPassword");
  });

  test("resend-verification route NEVER leaks token or exposes user existence", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u-1",
      email: "exists@example.com",
      emailVerified: null,
    });
    (db.verificationToken.create as jest.Mock).mockResolvedValue({
      token: "leak-attempt-token",
    });

    const req = {
      json: async () => ({ email: "exists@example.com" }),
    } as any;

    const res = await resendHandler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("If the account exists, an email was sent");
    expect(body.data).toBeNull();
    expect(JSON.stringify(body)).not.toContain("leak-attempt-token");
  });

  test("login route returns generic 401 error with no account enumeration", async () => {
    // Non-existent user
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const req = {
      json: async () => ({ email: "unknown@example.com", password: "password123" }),
    } as any;

    const res = await loginHandler(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.message).toBe("Invalid email or password");
    expect(body.data).toBeNull();
  });

  test("login route success response NEVER contains password hash", async () => {
    const passwordHash = await bcrypt.hash("MyValidPass123!", 10);
    (db.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-legit",
      name: "Legit User",
      email: "legit@example.com",
      image: null,
      emailVerified: new Date(),
      role: "USER",
      tokens: 100,
      password: passwordHash,
    });

    const req = {
      json: async () => ({ email: "legit@example.com", password: "MyValidPass123!" }),
    } as any;

    const res = await loginHandler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("user-legit");
    expect(body.data.password).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(passwordHash);
  });
});
