/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import {
  validateUsernameFormat,
  generateDefaultUsername,
  normalizeUsername,
} from "@/lib/username";
import {
  checkUsernameAvailability,
  claimUsername,
  resetUsernameLimit,
  generateUniqueDefaultUsername,
} from "@/server/services/username";
import { GET as checkUsernameRoute } from "@/app/api/v1/usernames/check/route";
import { PUT as claimUsernameRoute } from "@/app/api/v1/me/username/route";
import { POST as resetLimitRoute } from "@/app/api/v1/admin/users/[id]/reset-username-limit/route";

let mockActor: {
  userId: string;
  role: "USER" | "ADMIN";
  sessionId: string;
  email: string;
} | null = null;

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => {
    if (!mockActor) return null;
    return mockActor;
  }),
}));

describe("Step 7.1 — Usernames (default + change once)", () => {
  const testSuffix = Date.now().toString().slice(-6);
  const userId1 = `user_u1_${testSuffix}`;
  const userId2 = `user_u2_${testSuffix}`;
  const adminId = `user_admin_${testSuffix}`;
  const concurrentUserId = `user_conc_${testSuffix}`;

  beforeAll(async () => {
    // Clean up any test users
    await db.auditLog.deleteMany({
      where: {
        userId: { in: [userId1, userId2, adminId, concurrentUserId] },
      },
    });
    await db.user.deleteMany({
      where: {
        id: { in: [userId1, userId2, adminId, concurrentUserId] },
      },
    });

    // Create test users
    const defaultUser1 = await generateUniqueDefaultUsername();
    const defaultUser2 = await generateUniqueDefaultUsername();
    const defaultConc = await generateUniqueDefaultUsername();

    await db.user.createMany({
      data: [
        {
          id: userId1,
          email: `u1_${testSuffix}@example.com`,
          name: "User One",
          username: defaultUser1,
          displayUsername: defaultUser1,
          usernameChangeCount: 0,
        },
        {
          id: userId2,
          email: `u2_${testSuffix}@example.com`,
          name: "User Two",
          username: defaultUser2,
          displayUsername: defaultUser2,
          usernameChangeCount: 0,
        },
        {
          id: adminId,
          email: `admin_${testSuffix}@example.com`,
          name: "Admin User",
          role: "ADMIN",
          username: `adm_${testSuffix}`,
          displayUsername: `adm_${testSuffix}`,
          usernameChangeCount: 0,
        },
        {
          id: concurrentUserId,
          email: `conc_${testSuffix}@example.com`,
          name: "Concurrent User",
          username: defaultConc,
          displayUsername: defaultConc,
          usernameChangeCount: 0,
        },
      ],
    });
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({
      where: {
        userId: { in: [userId1, userId2, adminId, concurrentUserId] },
      },
    });
    await db.user.deleteMany({
      where: {
        id: { in: [userId1, userId2, adminId, concurrentUserId] },
      },
    });
  });

  describe("Validation & Generation Rules", () => {
    test("generateDefaultUsername produces valid user_ prefix with 8 chars", () => {
      const generated = generateDefaultUsername();
      expect(generated).toMatch(/^user_[a-z0-9]{8}$/);
    });

    test("allows valid usernames", () => {
      expect(validateUsernameFormat("johndoe").valid).toBe(true);
      expect(validateUsernameFormat("alice_99").valid).toBe(true);
      expect(validateUsernameFormat("my_cool_name").valid).toBe(true);
    });

    test("rejects usernames shorter than 3 characters", () => {
      const res = validateUsernameFormat("ab");
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("at least 3 characters");
      }
    });

    test("rejects usernames longer than 30 characters", () => {
      const res = validateUsernameFormat("a".repeat(31));
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("cannot exceed 30 characters");
      }
    });

    test("rejects usernames not starting with a letter", () => {
      expect(validateUsernameFormat("1johndoe").valid).toBe(false);
      expect(validateUsernameFormat("_johndoe").valid).toBe(false);
    });

    test("rejects consecutive underscores", () => {
      expect(validateUsernameFormat("john__doe").valid).toBe(false);
    });

    test("rejects special characters other than underscore", () => {
      expect(validateUsernameFormat("john-doe").valid).toBe(false);
      expect(validateUsernameFormat("john.doe").valid).toBe(false);
      expect(validateUsernameFormat("john@doe").valid).toBe(false);
    });

    test("rejects reserved usernames", () => {
      const reserved = ["admin", "root", "support", "help", "api", "klecx", "billing", "system", "login"];
      for (const name of reserved) {
        const res = validateUsernameFormat(name);
        expect(res.valid).toBe(false);
      }
    });

    test("rejects profanities", () => {
      expect(validateUsernameFormat("badasshole").valid).toBe(false);
    });
  });

  describe("Availability Check", () => {
    test("returns false for reserved names without leaking details", async () => {
      const res = await checkUsernameAvailability("admin");
      expect(res.available).toBe(false);
    });

    test("returns false for taken usernames", async () => {
      const user = await db.user.findUnique({ where: { id: userId1 } });
      const res = await checkUsernameAvailability(user!.username!);
      expect(res.available).toBe(false);
    });

    test("returns true for the user's own current username", async () => {
      const user = await db.user.findUnique({ where: { id: userId1 } });
      const res = await checkUsernameAvailability(user!.username!, userId1);
      expect(res.available).toBe(true);
    });

    test("returns true for an available valid username", async () => {
      const uniqueName = `avail_${testSuffix}`;
      const res = await checkUsernameAvailability(uniqueName);
      expect(res.available).toBe(true);
    });
  });

  describe("Claim Username Service & Endpoint", () => {
    const customUser1 = `claimed_${testSuffix}`;

    test("user can claim custom username once", async () => {
      const claimed = await claimUsername(userId1, customUser1);
      expect(claimed.username).toBe(customUser1);
      expect(claimed.displayUsername).toBe(customUser1);

      const dbUser = await db.user.findUnique({ where: { id: userId1 } });
      expect(dbUser?.username).toBe(customUser1);
      expect(dbUser?.usernameChangeCount).toBe(1);
      expect(dbUser?.usernameClaimedAt).not.toBeNull();

      // Verify AuditLog written
      const audit = await db.auditLog.findFirst({
        where: {
          userId: userId1,
          action: "USER_USERNAME_CLAIMED",
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.targetId).toBe(userId1);
    });

    test("second change attempt by same user returns 409 Conflict", async () => {
      await expect(
        claimUsername(userId1, `another_${testSuffix}`)
      ).rejects.toMatchObject({
        status: 409,
        code: "username_already_changed",
      });
    });

    test("another user attempting to claim taken username returns 409 Conflict", async () => {
      await expect(
        claimUsername(userId2, customUser1)
      ).rejects.toMatchObject({
        status: 409,
        code: "username_taken",
      });
    });

    test("PUT /api/v1/me/username claims username for authenticated actor", async () => {
      mockActor = {
        userId: userId2,
        role: "USER",
        sessionId: `sess_${userId2}`,
        email: `u2_${testSuffix}@example.com`,
      };

      const customUser2 = `user2_${testSuffix}`;
      const req = new NextRequest("http://localhost:3000/api/v1/me/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: customUser2 }),
      });

      const response = await claimUsernameRoute(req);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data.username).toBe(customUser2);

      const dbUser = await db.user.findUnique({ where: { id: userId2 } });
      expect(dbUser?.username).toBe(customUser2);
      expect(dbUser?.usernameChangeCount).toBe(1);
    });
  });

  describe("Concurrency Test: Two Simultaneous Claim Requests", () => {
    test("concurrent claim attempts (2 tabs) -> exactly one succeeds, second returns 409", async () => {
      const nameA = `tab_a_${testSuffix}`;
      const nameB = `tab_b_${testSuffix}`;

      // Run two claims at the exact same moment
      const results = await Promise.allSettled([
        claimUsername(concurrentUserId, nameA),
        claimUsername(concurrentUserId, nameB),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const error = (rejected[0] as PromiseRejectedResult).reason;
      expect(error.status).toBe(409);

      // Verify DB state
      const dbUser = await db.user.findUnique({ where: { id: concurrentUserId } });
      expect(dbUser?.usernameChangeCount).toBe(1);
      expect([nameA, nameB]).toContain(dbUser?.username);
    });
  });

  describe("Admin Reset Username Limit", () => {
    test("non-admin actor cannot reset limit (403 Forbidden)", async () => {
      mockActor = {
        userId: userId1,
        role: "USER",
        sessionId: `sess_${userId1}`,
        email: `u1_${testSuffix}@example.com`,
      };

      const req = new NextRequest(
        `http://localhost:3000/api/v1/admin/users/${userId1}/reset-username-limit`,
        { method: "POST" }
      );

      const res = await resetLimitRoute(req, {
        params: Promise.resolve({ id: userId1 }),
      });
      expect(res.status).toBe(403);
    });

    test("admin actor can reset target user limit and audit log is written", async () => {
      mockActor = {
        userId: adminId,
        role: "ADMIN",
        sessionId: `sess_${adminId}`,
        email: `admin_${testSuffix}@example.com`,
      };

      const req = new NextRequest(
        `http://localhost:3000/api/v1/admin/users/${userId1}/reset-username-limit`,
        { method: "POST" }
      );

      const res = await resetLimitRoute(req, {
        params: Promise.resolve({ id: userId1 }),
      });
      expect(res.status).toBe(200);

      const dbUser = await db.user.findUnique({ where: { id: userId1 } });
      expect(dbUser?.usernameChangeCount).toBe(0);

      // Verify audit log
      const audit = await db.auditLog.findFirst({
        where: {
          userId: adminId,
          action: "ADMIN_RESET_USERNAME_LIMIT",
          targetId: userId1,
        },
      });
      expect(audit).not.toBeNull();

      // Now user1 can claim again!
      const newCustom = `reclaimed_${testSuffix}`;
      const claimed = await claimUsername(userId1, newCustom);
      expect(claimed.username).toBe(newCustom);
    });
  });

  describe("Availability Check Route GET /api/v1/usernames/check", () => {
    test("GET /api/v1/usernames/check?u=valid returns available: true", async () => {
      mockActor = null;
      const req = new NextRequest(
        `http://localhost:3000/api/v1/usernames/check?u=brandnew_${testSuffix}`
      );
      const res = await checkUsernameRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.available).toBe(true);
    });

    test("GET /api/v1/usernames/check?u=admin returns available: false", async () => {
      mockActor = null;
      const req = new NextRequest(
        "http://localhost:3000/api/v1/usernames/check?u=admin"
      );
      const res = await checkUsernameRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.available).toBe(false);
    });
  });
});
