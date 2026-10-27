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
  resetInMemoryRateLimits,
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

  it("reads the first x-forwarded-for entry only when TRUST_PROXY=true", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/test", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      },
    });

    expect(getClientIp(req, false)).toBe("127.0.0.1");
    expect(getClientIp(req, true)).toBe("203.0.113.195");
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

  it("authSecondaryStorage stores, retrieves, increments, getAndDeletes, and deletes keys in memory", async () => {
    await authSecondaryStorage.set("test-key", "val-1", 60);
    expect(await authSecondaryStorage.get("test-key")).toBe("val-1");

    await authSecondaryStorage.delete("test-key");
    expect(await authSecondaryStorage.get("test-key")).toBeNull();

    await authSecondaryStorage.set("once-key", "one-time-token", 60);
    expect(await authSecondaryStorage.getAndDelete("once-key")).toBe("one-time-token");
    expect(await authSecondaryStorage.get("once-key")).toBeNull();

    expect(await authSecondaryStorage.increment("counter-key", 60)).toBe(1);
    expect(await authSecondaryStorage.increment("counter-key", 60)).toBe(2);
  });
});
