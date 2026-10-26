/**
 * @jest-environment node
 */
const mockGetSession = jest.fn();

jest.mock("../../server/auth/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

import { NextRequest } from "next/server";
import { getActor } from "../../server/auth/session";
import { route } from "../../server/http/route";

describe("Security: Better Auth Session & Bearer Token Resolution (Step 1.3)", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  test("getActor resolves Actor from Bearer token or cookie headers via Better Auth", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "usr_01",
        email: "alice@example.com",
        name: "Alice",
        role: "USER",
        image: null,
      },
      session: {
        id: "sess_01",
      },
    });

    const req = new NextRequest("http://localhost:3000/api/v1/workspaces", {
      headers: {
        Authorization: "Bearer valid_session_token_123",
      },
    });

    const actor = await getActor(req);
    expect(actor).toEqual({
      userId: "usr_01",
      role: "USER",
      sessionId: "sess_01",
      email: "alice@example.com",
      name: "Alice",
      image: null,
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    const passedHeaders = mockGetSession.mock.calls[0][0].headers as Headers;
    expect(passedHeaders.get("authorization")).toBe(
      "Bearer valid_session_token_123"
    );
  });

  test("route() authenticates requests carrying Authorization: Bearer <token>", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "usr_mobile_01",
        email: "mobile@example.com",
        name: "Mobile User",
        role: "USER",
      },
      session: {
        id: "sess_mobile_01",
      },
    });

    const handler = route({
      handler: async ({ actor }) => ({
        userId: actor.userId,
        sessionId: actor.sessionId,
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/v1/me", {
      headers: {
        Authorization: "Bearer mobile_bearer_token",
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      data: {
        userId: "usr_mobile_01",
        sessionId: "sess_mobile_01",
      },
    });
  });

  test("route() rejects invalid/expired Bearer token with 401 unauthorized", async () => {
    mockGetSession.mockResolvedValue(null);

    const handler = route({
      handler: async ({ actor }) => ({ userId: actor.userId }),
    });

    const req = new NextRequest("http://localhost:3000/api/v1/me", {
      headers: {
        Authorization: "Bearer invalid_or_expired_token",
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });
});
