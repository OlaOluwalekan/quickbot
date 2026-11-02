/**
 * @jest-environment node
 */
jest.mock("../../server/auth/session", () => ({
  getActor: jest.fn(),
}));

import { NextRequest } from "next/server";
import { z } from "zod";
import { route } from "@/server/http/route";
import { Errors } from "@/server/http/errors";
import { pageQuery, toPage } from "@/server/http/pagination";
import { idSchema, localeSchema, titleSchema } from "@/lib/schemas/common";
import { getActor, type Actor } from "../../server/auth/session";

const mockedGetActor = getActor as jest.MockedFunction<typeof getActor>;

describe("server/http API foundation (Step 1.2)", () => {
  const mockActor: Actor = {
    userId: "01966f0c-7c2a-7000-8000-000000000001",
    role: "USER",
    sessionId: "sess_123",
    email: "user@example.com",
  };

  beforeEach(() => {
    mockedGetActor.mockReset();
  });

  it("returns 200 with { data } envelope and echoes/generates x-request-id for valid input", async () => {
    mockedGetActor.mockResolvedValue(mockActor);

    const handler = route({
      body: z.object({ title: titleSchema }),
      query: pageQuery,
      handler: async ({ actor, body, query, requestId }) => ({
        userId: actor.userId,
        title: body.title,
        limit: query.limit,
        requestId,
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test?limit=10", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-custom-123",
      },
      body: JSON.stringify({ title: "  Hello Klecx  " }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-custom-123");

    const json = await res.json();
    expect(json).toEqual({
      data: {
        userId: mockActor.userId,
        title: "Hello Klecx",
        limit: 10,
        requestId: "req-custom-123",
      },
    });
  });

  it("returns 422 validation_error envelope for invalid body or query input", async () => {
    mockedGetActor.mockResolvedValue(mockActor);

    const handler = route({
      body: z.object({ title: titleSchema }),
      handler: async ({ body }) => body,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });

    const res = await handler(req);
    expect(res.status).toBe(422);
    expect(res.headers.get("x-request-id")).toBeTruthy();

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe("validation_error");
    expect(json.error.message).toBe("Invalid input");
    expect(json.error.details?.fieldErrors?.title).toBeDefined();
    expect(json.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("returns 400 bad_request envelope for malformed JSON", async () => {
    mockedGetActor.mockResolvedValue(mockActor);

    const handler = route({
      body: z.object({ title: titleSchema }),
      handler: async ({ body }) => body,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-valid-json",
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("bad_request");
  });

  it("returns 401 unauthorized when auth is required and getActor returns null", async () => {
    mockedGetActor.mockResolvedValue(null);

    const handler = route({
      handler: async () => ({ ok: true }),
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test");
    const res = await handler(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({
      error: {
        code: "unauthorized",
        message: "Authentication required",
        requestId: expect.any(String),
      },
    });
  });

  it("allows unauthenticated requests when auth is optional", async () => {
    mockedGetActor.mockResolvedValue(null);

    const handler = route({
      auth: "optional",
      handler: async ({ actor }) => ({ authenticated: Boolean(actor) }),
    });

    const req = new NextRequest("http://localhost:3000/api/v1/public");
    const res = await handler(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { authenticated: false } });
  });

  it("returns 429 with Retry-After header when Errors.rateLimited is thrown", async () => {
    mockedGetActor.mockResolvedValue(mockActor);

    const handler = route({
      handler: async () => {
        throw Errors.rateLimited(45);
      },
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test");
    const res = await handler(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const json = await res.json();
    expect(json.error.code).toBe("rate_limited");
    expect(json.error.details).toEqual({ retryAfter: 45 });
  });

  it("returns 500 internal_error with no stack trace or internal error leak on unexpected throws", async () => {
    mockedGetActor.mockResolvedValue(mockActor);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const handler = route({
      handler: async () => {
        throw new Error("Sensitive database connection string leaked in error");
      },
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test");
    const res = await handler(req);

    expect(res.status).toBe(500);
    const rawBody = await res.text();
    expect(rawBody).not.toContain("Sensitive database");
    expect(rawBody).not.toContain("at ");

    const json = JSON.parse(rawBody);
    expect(json).toEqual({
      error: {
        code: "internal_error",
        message: "Something went wrong",
        requestId: expect.any(String),
      },
    });
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  describe("pagination & common schemas", () => {
    it("paginates rows with toPage and computes nextCursor", () => {
      const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];
      expect(toPage(rows, 2)).toEqual({
        items: [{ id: "1" }, { id: "2" }],
        nextCursor: "2",
      });
      expect(toPage(rows.slice(0, 2), 2)).toEqual({
        items: [{ id: "1" }, { id: "2" }],
        nextCursor: null,
      });
    });

    it("validates idSchema, titleSchema, and localeSchema", () => {
      expect(
        idSchema.safeParse("01966f0c-7c2a-7000-8000-000000000001").success
      ).toBe(true);
      expect(idSchema.safeParse("not-a-uuid").success).toBe(false);
      expect(titleSchema.safeParse("Valid title").success).toBe(true);
      expect(titleSchema.safeParse("a".repeat(121)).success).toBe(false);
      expect(localeSchema.safeParse("en").success).toBe(true);
      expect(localeSchema.safeParse("fr").success).toBe(true);
      expect(localeSchema.safeParse("de").success).toBe(false);
    });
  });
});
