/**
 * @jest-environment node
 */
jest.mock("../../server/auth/session", () => ({
  getActor: jest.fn(),
}));

const mockBetterAuthPost = jest.fn();
const mockBetterAuthGet = jest.fn();

jest.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: (...args: unknown[]) => mockBetterAuthGet(...args),
    POST: (...args: unknown[]) => mockBetterAuthPost(...args),
  }),
  nextCookies: () => ({}),
}));

jest.mock("../../server/auth/auth", () => ({
  auth: {},
}));

import { NextRequest } from "next/server";
import {
  authSecondaryStorage,
  getClientIp,
  limit,
  policies,
  readTrustedProxyAddress,
  resetInMemoryRateLimits,
  resolveClientIp,
  setRateLimitBackendForTests,
} from "@/server/http/rate-limit";
import { ApiError } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { POST as authPostHandler } from "@/app/api/auth/[...all]/route";
import { getActor, type Actor } from "../../server/auth/session";

const mockedGetActor = getActor as jest.MockedFunction<typeof getActor>;

describe("server/http/rate-limit (Step 1.4)", () => {
  const mockActor: Actor = {
    userId: "01966f0c-7c2a-7000-8000-000000000001",
    role: "USER",
    sessionId: "sess_123",
    email: "user@example.com",
  };

  beforeEach(() => {
    resetInMemoryRateLimits();
    setRateLimitBackendForTests(null);
    mockedGetActor.mockReset();
    mockBetterAuthPost.mockReset();
    mockBetterAuthGet.mockReset();
  });

  it("defines all required rate-limit policies", () => {
    expect(policies["auth:signin"]).toEqual({ n: 5, window: "1 m" });
    expect(policies["auth:signup"]).toEqual({ n: 5, window: "1 h" });
    expect(policies["auth:reset"]).toEqual({ n: 3, window: "1 h" });
    expect(policies["auth:verify"]).toEqual({ n: 3, window: "1 h" });
    expect(policies["api:default"]).toEqual({ n: 120, window: "1 m" });
    expect(policies["gen:start"]).toEqual({ n: 20, window: "1 m" });
    expect(policies["upload"]).toEqual({ n: 30, window: "10 m" });
    expect(policies["share:create"]).toEqual({ n: 20, window: "1 h" });
    expect(policies["invite:send"]).toEqual({ n: 20, window: "1 h" });
    expect(policies["support:send"]).toEqual({ n: 3, window: "1 h" });
  });

  it("in-memory limiter allows up to n requests and rejects the (n+1)th with 429 and retryAfter", async () => {
    const key = "127.0.0.1:alice@example.com";

    for (let i = 0; i < 5; i++) {
      await expect(limit("auth:signin", key)).resolves.toBeUndefined();
    }

    try {
      await limit("auth:signin", key);
      throw new Error("Expected 6th call to throw ApiError 429");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe("rate_limited");
      expect(apiErr.details).toEqual({
        retryAfter: expect.any(Number),
      });
      expect((apiErr.details as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
    }
  });

  it("returns 429 with Retry-After header on the 6th wrong sign-in in a minute", async () => {
    mockBetterAuthPost.mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: "Invalid email or password" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );

    const makeSignInReq = () =>
      new NextRequest("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Victim@Example.com",
          password: "wrong-password-123",
        }),
      });

    for (let i = 0; i < 5; i++) {
      const res = await authPostHandler(makeSignInReq());
      expect(res.status).toBe(401);
    }

    const sixthRes = await authPostHandler(makeSignInReq());
    expect(sixthRes.status).toBe(429);
    const retryAfter = sixthRes.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
  });

  it("applies custom rateLimit option in route() and returns 429 + Retry-After when exceeded", async () => {
    mockedGetActor.mockResolvedValue(mockActor);

    const handler = route({
      rateLimit: {
        policy: "support:send",
        key: ({ actor }) => actor.userId,
      },
      handler: async () => ({ sent: true }),
    });

    for (let i = 0; i < 3; i++) {
      const res = await handler(
        new NextRequest("http://localhost:3000/api/v1/support")
      );
      expect(res.status).toBe(200);
    }

    const fourthRes = await handler(
      new NextRequest("http://localhost:3000/api/v1/support")
    );
    expect(fourthRes.status).toBe(429);
    expect(fourthRes.headers.get("Retry-After")).toBeTruthy();
  });

  it("resolves client IP only when TRUST_PROXY=true and validates the proxy address", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/test", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      },
    });

    // When TRUST_PROXY=false, returns null (never "127.0.0.1" and never trusts header)
    expect(resolveClientIp(req, false)).toBeNull();
    expect(getClientIp(req, false)).toBeNull();

    // When TRUST_PROXY=true, reads and validates the first forwarded IP
    expect(resolveClientIp(req, true)).toBe("203.0.113.195");
    expect(getClientIp(req, true)).toBe("203.0.113.195");

    // Normalizes IPv4-mapped IPv6
    const mappedReq = new NextRequest("http://localhost:3000/api/v1/test", {
      headers: {
        "x-real-ip": "::ffff:198.51.100.42",
      },
    });
    expect(readTrustedProxyAddress(mappedReq)).toBe("198.51.100.42");

    // Rejects invalid IP strings
    const invalidIpReq = new NextRequest("http://localhost:3000/api/v1/test", {
      headers: {
        "x-forwarded-for": "not-an-ip-address",
      },
    });
    expect(resolveClientIp(invalidIpReq, true)).toBeNull();
  });

  it("gives different clients independent signup buckets, enforces per-client limits, and ignores untrusted forwarded headers", async () => {
    mockBetterAuthPost.mockImplementation(
      async () =>
        new Response(JSON.stringify({ user: { id: "u1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );

    // 1. With TRUST_PROXY=false (default): 6 different users signing up do NOT share a "127.0.0.1" bucket
    for (let i = 1; i <= 6; i++) {
      const res = await authPostHandler(
        new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: `user${i}@example.com`,
            password: "strong-password-123",
            name: `User ${i}`,
          }),
        })
      );
      expect(res.status).toBe(200);
    }

    // 2. Repeated signup requests from one client hit its limit on the 6th attempt,
    //    even if the caller rotates untrusted x-forwarded-for headers on each request
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await authPostHandler(
        new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `203.0.113.${attempt}`,
          },
          body: JSON.stringify({
            email: "attacker@example.com",
            password: "strong-password-123",
            name: "Attacker",
          }),
        })
      );
      expect(res.status).toBe(200);
    }

    const sixthAttemptWithSpoofedIp = await authPostHandler(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.99",
        },
        body: JSON.stringify({
          email: "attacker@example.com",
          password: "strong-password-123",
          name: "Attacker",
        }),
      })
    );
    expect(sixthAttemptWithSpoofedIp.status).toBe(429);

    // Meanwhile, another client can still sign up unaffected
    const otherClientRes = await authPostHandler(
      new NextRequest("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "legit-other@example.com",
          password: "strong-password-123",
          name: "Legit Other",
        }),
      })
    );
    expect(otherClientRes.status).toBe(200);
  });

  it("fails CLOSED (429) for auth:* policies and fails OPEN for non-auth policies when Redis is down", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    setRateLimitBackendForTests(async () => {
      throw new Error("Redis connection refused");
    });

    // auth:* must fail closed with 429
    await expect(limit("auth:signin", "127.0.0.1:user@example.com")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });

    // non-auth policies must fail open and log
    await expect(limit("api:default", "user_123")).resolves.toBeUndefined();
    await expect(limit("gen:start", "user_123")).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("authSecondaryStorage consumes single-use tokens atomically and handles expiry", async () => {
    await authSecondaryStorage.set("test-key", "val-1", 60);
    expect(await authSecondaryStorage.get("test-key")).toBe("val-1");

    await authSecondaryStorage.delete("test-key");
    expect(await authSecondaryStorage.get("test-key")).toBeNull();

    // Two concurrent calls for the same single-use token return the value exactly once
    await authSecondaryStorage.set("once-key", "one-time-token", 60);
    const [first, second] = await Promise.all([
      authSecondaryStorage.getAndDelete("once-key"),
      authSecondaryStorage.getAndDelete("once-key"),
    ]);
    expect([first, second].filter((v) => v === "one-time-token")).toHaveLength(1);
    expect([first, second].filter((v) => v === null)).toHaveLength(1);
    expect(await authSecondaryStorage.get("once-key")).toBeNull();
    expect(await authSecondaryStorage.getAndDelete("missing-key")).toBeNull();

    // Expired tokens return null
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);
    await authSecondaryStorage.set("expiring-key", "ephemeral", 10);
    nowSpy.mockReturnValue(1_010_000); // 10 seconds later (expired)
    expect(await authSecondaryStorage.getAndDelete("expiring-key")).toBeNull();
    nowSpy.mockRestore();

    expect(await authSecondaryStorage.increment("counter-key", 60)).toBe(1);
    expect(await authSecondaryStorage.increment("counter-key", 60)).toBe(2);
  });

  it("preserves database session storage alongside secondaryStorage in server/auth/auth.ts", () => {
    const fs = jest.requireActual("node:fs") as typeof import("node:fs");
    const path = jest.requireActual("node:path") as typeof import("node:path");
    const authFile = fs.readFileSync(
      path.join(process.cwd(), "server/auth/auth.ts"),
      "utf8"
    );
    expect(authFile).toContain("storeSessionInDatabase: true");
    expect(authFile).toContain("storeInDatabase: true");
  });
});
