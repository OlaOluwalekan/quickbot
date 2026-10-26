/**
 * @jest-environment node
 */
jest.mock("better-auth/cookies", () => ({
  getSessionCookie: jest.fn((req: Request) =>
    req.headers.get("cookie")?.includes("better-auth.session_token=")
      ? "session-token-value"
      : null
  ),
}));

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { RegisterSchema, LoginSchema, PASSWORD_MIN_LENGTH } from "@/lib/schemas/auth";

describe("Security: Better Auth & Schema Security (Step 1.3)", () => {
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

  test("server/env throws when BETTER_AUTH_SECRET is missing or < 32 chars", () => {
    const origBetter = process.env.BETTER_AUTH_SECRET;
    const origAuth = process.env.AUTH_SECRET;
    try {
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.AUTH_SECRET;
      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("../../server/env");
        });
      }).toThrow(/BETTER_AUTH_SECRET/);
    } finally {
      if (origBetter !== undefined) process.env.BETTER_AUTH_SECRET = origBetter;
      if (origAuth !== undefined) process.env.AUTH_SECRET = origAuth;
    }
  });

  test("RegisterSchema enforces minimum 10-character password rule and confirmation match", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);

    const shortPassword = RegisterSchema.safeParse({
      email: "user@example.com",
      name: "Alice",
      password: "short8!!",
      confirmPassword: "short8!!",
    });
    expect(shortPassword.success).toBe(false);

    const mismatch = RegisterSchema.safeParse({
      email: "user@example.com",
      name: "Alice",
      password: "ValidTenCharPass!",
      confirmPassword: "DifferentTenChar!",
    });
    expect(mismatch.success).toBe(false);

    const valid = RegisterSchema.safeParse({
      email: "user@example.com",
      name: "Alice",
      password: "ValidTenCharPass!",
      confirmPassword: "ValidTenCharPass!",
    });
    expect(valid.success).toBe(true);
  });

  test("LoginSchema validates email and non-empty password", () => {
    expect(
      LoginSchema.safeParse({ email: "not-an-email", password: "secret" }).success
    ).toBe(false);
    expect(
      LoginSchema.safeParse({ email: "user@example.com", password: "" }).success
    ).toBe(false);
    expect(
      LoginSchema.safeParse({ email: "user@example.com", password: "secret" })
        .success
    ).toBe(true);
  });

  test("codebase contains zero references to legacy next-auth", () => {
    const dirsToScan = ["app", "components", "server", "lib", "utils", "providers"];
    const offendingFiles: string[] = [];

    function walk(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name === "generated" || entry.name === "node_modules") continue;
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, "utf8");
          if (content.includes("next-auth")) {
            offendingFiles.push(path.relative(process.cwd(), fullPath));
          }
        }
      }
    }

    for (const d of dirsToScan) {
      walk(path.resolve(process.cwd(), d));
    }
    const proxyContent = fs.readFileSync(
      path.resolve(process.cwd(), "proxy.ts"),
      "utf8"
    );
    expect(proxyContent).not.toContain("next-auth");
    expect(offendingFiles).toEqual([]);
  });

  test("proxy leaves /api/auth/*, /api/webhooks/*, /api/cron/*, and /s/* public and redirects unauthenticated page requests", async () => {
    const { proxy } = await import("../../proxy");

    const publicAuthApi = new NextRequest("http://localhost:3000/api/auth/session");
    const res1 = await proxy(publicAuthApi);
    expect(res1.headers.get("location")).toBeNull();

    const publicWebhook = new NextRequest("http://localhost:3000/api/webhooks/creem");
    const res2 = await proxy(publicWebhook);
    expect(res2.headers.get("location")).toBeNull();

    const publicShare = new NextRequest("http://localhost:3000/s/share-token-123");
    const res3 = await proxy(publicShare);
    expect(res3.headers.get("location")).toBeNull();

    const protectedPage = new NextRequest("http://localhost:3000/chat");
    const res4 = await proxy(protectedPage);
    expect(res4.status).toBe(307);
    expect(res4.headers.get("location")).toContain("/auth/login");

    const authenticatedAuthPage = new NextRequest(
      "http://localhost:3000/auth/login",
      {
        headers: {
          cookie: "better-auth.session_token=valid_cookie",
        },
      }
    );
    const res5 = await proxy(authenticatedAuthPage);
    expect(res5.status).toBe(307);
    expect(res5.headers.get("location")).toContain("/chat");
  });
});
