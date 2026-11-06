/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { hashPassword } from "better-auth/crypto";
import {
  parseDeviceMetadata,
  maskIp,
  isRecentAuth,
  listUserSessions,
  revokeUserSession,
  revokeOtherUserSessions,
  revokeAllUserSessions,
  checkAndAlertNewSignIn,
} from "@/server/services/session";
import { GET as getSessionsRoute, DELETE as deleteSessionsRoute } from "@/app/api/v1/me/sessions/route";
import { DELETE as deleteSingleSessionRoute } from "@/app/api/v1/me/sessions/[id]/route";
import { sendEmail } from "@/server/email/send";

jest.mock("../server/email/send", () => ({
  sendEmail: jest.fn(async () => ({ success: true, id: "msg_123" })),
}));

let mockActor: {
  userId: string;
  role: "USER" | "ADMIN";
  sessionId: string;
  email: string;
} | null = null;

jest.mock("../server/auth/session", () => {
  const actual = jest.requireActual("../server/auth/session");
  return {
    ...actual,
    getActor: jest.fn(async () => {
      if (!mockActor) return null;
      return mockActor;
    }),
    requireActor: jest.fn(async () => {
      if (!mockActor) {
        const { redirect } = require("next/navigation");
        redirect("/auth/login?reason=expired");
      }
      return mockActor;
    }),
  };
});

describe("Step 7.3 — Device sessions and revocation", () => {
  const testSuffix = Date.now().toString().slice(-6);
  const userAId = `user_sess_a_${testSuffix}`;
  const userBId = `user_sess_b_${testSuffix}`;
  const userAEmail = `user_a_${testSuffix}@example.com`;
  const userBEmail = `user_b_${testSuffix}@example.com`;

  const sessionA1Id = `sess_a1_${testSuffix}`;
  const sessionA2Id = `sess_a2_${testSuffix}`;
  const sessionA3Id = `sess_a3_${testSuffix}`;
  const sessionB1Id = `sess_b1_${testSuffix}`;

  const macChromeUA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const iPhoneSafariUA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const windowsFirefoxUA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";

  beforeAll(async () => {
    // Clean up
    await db.session.deleteMany({
      where: {
        userId: { in: [userAId, userBId] },
      },
    });
    await db.account.deleteMany({
      where: {
        userId: { in: [userAId, userBId] },
      },
    });
    await db.user.deleteMany({
      where: {
        id: { in: [userAId, userBId] },
      },
    });

    // Create users
    await db.user.create({
      data: {
        id: userAId,
        email: userAEmail,
        name: "User A",
      },
    });
    await db.user.create({
      data: {
        id: userBId,
        email: userBEmail,
        name: "User B",
      },
    });

    // Create credential account for user A with hashed password "Secret123!"
    const hashedPassword = await hashPassword("Secret123!");
    await db.account.create({
      data: {
        id: `acc_a_${testSuffix}`,
        userId: userAId,
        accountId: userAEmail,
        providerId: "credential",
        password: hashedPassword,
      },
    });
  });

  beforeEach(async () => {
    (sendEmail as unknown as jest.Mock).mockClear();

    // Reset sessions
    await db.session.deleteMany({
      where: {
        userId: { in: [userAId, userBId] },
      },
    });

    // Create fresh baseline sessions
    const now = new Date();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.session.createMany({
      data: [
        {
          id: sessionA1Id,
          userId: userAId,
          token: `tok_a1_${testSuffix}`,
          expiresAt: future,
          ipAddress: "203.0.113.42",
          userAgent: macChromeUA,
          country: "US",
          deviceLabel: "Chrome on macOS",
          client: "web",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: sessionA2Id,
          userId: userAId,
          token: `tok_a2_${testSuffix}`,
          expiresAt: future,
          ipAddress: "198.51.100.15",
          userAgent: iPhoneSafariUA,
          country: "DE",
          deviceLabel: "iPhone 15",
          client: "mobile",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: sessionB1Id,
          userId: userBId,
          token: `tok_b1_${testSuffix}`,
          expiresAt: future,
          ipAddress: "192.0.2.1",
          userAgent: windowsFirefoxUA,
          country: "GB",
          deviceLabel: "Firefox on Windows",
          client: "web",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    mockActor = {
      userId: userAId,
      role: "USER",
      sessionId: sessionA1Id,
      email: userAEmail,
    };
  });

  afterAll(async () => {
    await db.session.deleteMany({
      where: {
        userId: { in: [userAId, userBId] },
      },
    });
    await db.account.deleteMany({
      where: {
        userId: { in: [userAId, userBId] },
      },
    });
    await db.user.deleteMany({
      where: {
        id: { in: [userAId, userBId] },
      },
    });
  });

  describe("Device Metadata & Helpers", () => {
    test("parseDeviceMetadata correctly parses desktop user agents", () => {
      const parsed = parseDeviceMetadata(macChromeUA);
      expect(parsed.browser).toBe("Chrome");
      expect(parsed.os).toBe("macOS");
      expect(parsed.client).toBe("web");
      expect(parsed.deviceLabel).toBe("Chrome on macOS");
    });

    test("parseDeviceMetadata correctly parses mobile user agents and headers", () => {
      const parsed = parseDeviceMetadata(iPhoneSafariUA, "My Work iPhone", "mobile");
      expect(parsed.browser).toContain("Safari");
      expect(parsed.os).toBe("iOS");
      expect(parsed.client).toBe("mobile");
      expect(parsed.deviceLabel).toBe("My Work iPhone");
    });

    test("maskIp masks IPv4 addresses to the subnet", () => {
      expect(maskIp("203.0.113.195")).toBe("203.0.113.x");
      expect(maskIp("127.0.0.1")).toBe("127.0.0.x");
    });

    test("maskIp masks IPv6 addresses", () => {
      expect(maskIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe("2001:db8:85a3:0:0:8a2e:370:x");
      expect(maskIp(null)).toBeNull();
    });

    test("isRecentAuth correctly validates 15-minute threshold", () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      const sixteenMinsAgo = new Date(Date.now() - 16 * 60 * 1000);

      expect(isRecentAuth(fiveMinsAgo)).toBe(true);
      expect(isRecentAuth(sixteenMinsAgo)).toBe(false);
    });
  });

  describe("New Sign-In Alerting", () => {
    test("does not send alert email on user's first session", async () => {
      await checkAndAlertNewSignIn({
        id: "sess_solo",
        userId: "non_existent_or_solo_user",
        userAgent: macChromeUA,
        country: "US",
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    test("does not send alert when signing in from an existing (browser, os, country) combo", async () => {
      // User A already has Chrome on macOS from US
      await checkAndAlertNewSignIn({
        id: "sess_new_dup",
        userId: userAId,
        userAgent: macChromeUA,
        country: "US",
      });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    test("sends new-sign-in alert email when signing in from a new (browser, os, country) combo", async () => {
      // User A signing in from Firefox on Windows from Japan (JP)
      await checkAndAlertNewSignIn({
        id: "sess_new_device",
        userId: userAId,
        userAgent: windowsFirefoxUA,
        country: "JP",
        ipAddress: "203.0.113.99",
      });

      expect(sendEmail).toHaveBeenCalledTimes(1);
      const [template, to, data] = (sendEmail as unknown as jest.Mock).mock.calls[0];
      expect(template).toBe("new-sign-in");
      expect(to).toBe(userAEmail);
      expect(data.location).toBe("JP");
      expect(data.ipAddress).toBe("203.0.113.x");
    });
  });

  describe("API: GET /api/v1/me/sessions", () => {
    test("returns formatted list of sessions with 'current' badge and masked IP", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions");
      const res = await getSessionsRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      const sessions = json.data;
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(2); // sessionA1 and sessionA2

      const current = sessions.find((s: { id: string }) => s.id === sessionA1Id);
      const other = sessions.find((s: { id: string }) => s.id === sessionA2Id);

      expect(current).toBeDefined();
      expect(current.current).toBe(true);
      expect(current.ip).toBe("203.0.113.x");
      expect(current.country).toBe("US");
      expect(current.client).toBe("web");
      expect(current.os).toBe("macOS");
      expect(current.browser).toBe("Chrome");

      expect(other).toBeDefined();
      expect(other.current).toBe(false);
      expect(other.ip).toBe("198.51.100.x");
      expect(other.country).toBe("DE");
      expect(other.client).toBe("mobile");
      expect(other.deviceLabel).toBe("iPhone 15");
    });

    test("rejects unauthenticated requests with 401", async () => {
      mockActor = null;
      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions");
      const res = await getSessionsRoute(req);
      expect(res.status).toBe(401);
    });
  });

  describe("API: DELETE /api/v1/me/sessions/:id (Single Session Revocation)", () => {
    test("successfully revokes another session belonging to the user", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/me/sessions/${sessionA2Id}`, {
        method: "DELETE",
      });
      const res = await deleteSingleSessionRoute(req, {
        params: Promise.resolve({ id: sessionA2Id }),
      });
      expect(res.status).toBe(200);

      const dbSession = await db.session.findUnique({
        where: { id: sessionA2Id },
      });
      expect(dbSession).toBeNull();
    });

    test("prevents revoking the current session via single-revoke endpoint (400)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/me/sessions/${sessionA1Id}`, {
        method: "DELETE",
      });
      const res = await deleteSingleSessionRoute(req, {
        params: Promise.resolve({ id: sessionA1Id }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.message).toContain("Cannot revoke current session");
    });

    test("returns 404 when trying to revoke another user's session", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/me/sessions/${sessionB1Id}`, {
        method: "DELETE",
      });
      const res = await deleteSingleSessionRoute(req, {
        params: Promise.resolve({ id: sessionB1Id }),
      });
      expect(res.status).toBe(404);

      // Session B1 should still exist untouched
      const dbSession = await db.session.findUnique({
        where: { id: sessionB1Id },
      });
      expect(dbSession).not.toBeNull();
    });
  });

  describe("API: DELETE /api/v1/me/sessions?scope=others (Revoke Others)", () => {
    test("revokes all other sessions when current session is fresh (< 15 min)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions?scope=others", {
        method: "DELETE",
      });
      const res = await deleteSessionsRoute(req);
      expect(res.status).toBe(200);

      const sessionsA = await db.session.findMany({
        where: { userId: userAId },
      });
      expect(sessionsA.length).toBe(1);
      expect(sessionsA[0]?.id).toBe(sessionA1Id);
    });

    test("blocks revoke-others with 403 FRESH_LOGIN_REQUIRED when session is older than 15 min and no password is sent", async () => {
      // Age current session to 20 minutes ago
      await db.session.update({
        where: { id: sessionA1Id },
        data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      });

      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions?scope=others", {
        method: "DELETE",
      });
      const res = await deleteSessionsRoute(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error.code).toBe("FRESH_LOGIN_REQUIRED");
    });

    test("allows revoke-others on older session when valid password re-entry is provided", async () => {
      // Age current session to 20 minutes ago
      await db.session.update({
        where: { id: sessionA1Id },
        data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      });

      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions?scope=others", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "Secret123!" }),
      });
      const res = await deleteSessionsRoute(req);
      expect(res.status).toBe(200);

      const sessionsA = await db.session.findMany({
        where: { userId: userAId },
      });
      expect(sessionsA.length).toBe(1);
      expect(sessionsA[0]?.id).toBe(sessionA1Id);
    });

    test("rejects revoke-others with 401 when invalid password re-entry is provided", async () => {
      // Age current session to 20 minutes ago
      await db.session.update({
        where: { id: sessionA1Id },
        data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
      });

      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions?scope=others", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "WrongPassword!" }),
      });
      const res = await deleteSessionsRoute(req);
      expect(res.status).toBe(401);
    });
  });

  describe("API: DELETE /api/v1/me/sessions?scope=all (Revoke All)", () => {
    test("revokes all sessions including current device", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/me/sessions?scope=all", {
        method: "DELETE",
      });
      const res = await deleteSessionsRoute(req);
      expect(res.status).toBe(200);

      const sessionsA = await db.session.findMany({
        where: { userId: userAId },
      });
      expect(sessionsA.length).toBe(0);
    });
  });

  describe("Proxy & Session Revocation Redirect Flow", () => {
    test("requireActor redirects to /auth/login?reason=expired when session does not exist", async () => {
      mockActor = null;
      const { requireActor } = await import("@/server/auth/session");
      let caught: any = null;
      try {
        await requireActor();
      } catch (err: unknown) {
        caught = err;
      }
      expect(caught).not.toBeNull();
      expect(String(caught)).toContain("NEXT_REDIRECT");
      expect((caught as { digest?: string }).digest).toContain("/auth/login?reason=expired");
    });

    test("proxy clears auth cookies and displays login page when reason=expired is passed", async () => {
      const { proxy } = await import("@/proxy");
      const expiredReq = new NextRequest("http://localhost:3000/auth/login?reason=expired", {
        headers: {
          cookie: "better-auth.session_token=stale_token_after_revocation",
        },
      });
      const res = await proxy(expiredReq);
      // Crucial: Must NOT redirect back to /workspaces (which would cause an infinite loop)
      expect(res.headers.get("location")).toBeNull();
      // Must set cookie deletion headers
      const setCookieHeader = res.headers.get("set-cookie") || "";
      expect(setCookieHeader).toContain("better-auth.session_token=");
      expect(setCookieHeader).toContain("Max-Age=0");
    });

    test("proxy clears auth cookies and displays login page when reason=revoked is passed", async () => {
      const { proxy } = await import("@/proxy");
      const revokedReq = new NextRequest("http://localhost:3000/auth/login?reason=revoked", {
        headers: {
          cookie: "better-auth.session_token=revoked_token",
        },
      });
      const res = await proxy(revokedReq);
      expect(res.headers.get("location")).toBeNull();
      const setCookieHeader = res.headers.get("set-cookie") || "";
      expect(setCookieHeader).toContain("better-auth.session_token=");
      expect(setCookieHeader).toContain("Max-Age=0");
    });

    test("proxy canonical alias forwards /login to /auth/login", async () => {
      const { proxy } = await import("@/proxy");
      const loginReq = new NextRequest("http://localhost:3000/login?next=%2Fworkspaces");
      const res = await proxy(loginReq);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3000/auth/login?next=%2Fworkspaces");
    });
  });
});
