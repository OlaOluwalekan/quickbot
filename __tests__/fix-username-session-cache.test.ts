/**
 * @jest-environment node
 *
 * Sessions are kept in secondary storage with a copy of the user row, and
 * getSession() returns that copy. Claiming a username (or renaming) writes
 * straight to `users`, so without a refresh the copy kept saying "no username
 * claimed" and the claim banner / dialog came back on every reload.
 */
import { db } from "@/server/db/client";
import { auth } from "@/server/auth/auth";
import { authSecondaryStorage } from "@/server/http/rate-limit";
import { claimUsername, resetUsernameLimit } from "@/server/services/username";
import {
  getShellIdentity,
  updateUserProfile,
} from "@/server/services/user-profile";
import { refreshUserSessionCache } from "@/server/auth/refresh-user-sessions";

type CachedSession = {
  user: {
    name: string;
    username: string | null;
    usernameClaimedAt: string | null;
    usernameChangeCount: number;
  };
};

async function readCachedUser(token: string) {
  const raw = await authSecondaryStorage.get(token);
  if (!raw) throw new Error("session not in secondary storage");
  return (JSON.parse(raw) as CachedSession).user;
}

describe("Username claim refreshes cached sessions", () => {
  const suffix = Date.now().toString().slice(-6);
  const userId = `user_sesscache_${suffix}`;
  const otherId = `user_sesscache_o_${suffix}`;
  const adminId = `user_sesscache_a_${suffix}`;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    await db.user.createMany({
      data: [
        {
          id: userId,
          email: `${userId}@example.test`,
          name: "Before Name",
          username: `auto_${suffix}`,
          displayUsername: `auto_${suffix}`,
        },
        {
          id: otherId,
          email: `${otherId}@example.test`,
          name: "Other",
          username: `other_${suffix}`,
          displayUsername: `other_${suffix}`,
        },
        {
          id: adminId,
          email: `${adminId}@example.test`,
          name: "Admin",
          role: "ADMIN",
          username: `admin_${suffix}`,
          displayUsername: `admin_${suffix}`,
        },
      ],
    });

    // Two devices signed in: both cached copies must be refreshed.
    const ctx = await auth.$context;
    tokenA = (await ctx.internalAdapter.createSession(userId)).token;
    tokenB = (await ctx.internalAdapter.createSession(userId)).token;
  });

  afterAll(async () => {
    const ids = [userId, otherId, adminId];
    await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("starts with an unclaimed username in the cached session", async () => {
    const cached = await readCachedUser(tokenA);
    expect(cached.usernameClaimedAt).toBeNull();
  });

  it("claimUsername updates every cached session of that user", async () => {
    const wanted = `claimed_${suffix}`;
    await claimUsername(userId, wanted);

    for (const token of [tokenA, tokenB]) {
      const cached = await readCachedUser(token);
      expect(cached.username).toBe(wanted);
      expect(cached.usernameClaimedAt).not.toBeNull();
      expect(cached.usernameChangeCount).toBe(1);
    }
  });

  it("getSession returns the claimed username (what the app layout reads)", async () => {
    const ctx = await auth.$context;
    const found = await ctx.internalAdapter.findSession(tokenA);
    const user = found?.user as CachedSession["user"] | undefined;
    expect(user?.usernameClaimedAt).toBeTruthy();
  });

  it("resetUsernameLimit refreshes the target's cached sessions", async () => {
    await resetUsernameLimit(
      { userId: adminId, role: "ADMIN", sessionId: "s", email: "a@example.test" },
      userId
    );
    expect((await readCachedUser(tokenA)).usernameChangeCount).toBe(0);
  });

  it("updateUserProfile refreshes the cached name", async () => {
    await updateUserProfile(userId, { name: "After Name" });
    expect((await readCachedUser(tokenB)).name).toBe("After Name");
  });

  it("getShellIdentity reads name and username from the database", async () => {
    const identity = await getShellIdentity(userId);
    expect(identity?.name).toBe("After Name");
    expect(identity?.username).toBe(`claimed_${suffix}`);
    expect(identity?.usernameClaimedAt).toBeInstanceOf(Date);
  });

  it("never touches another user's sessions", async () => {
    const ctx = await auth.$context;
    const other = (await ctx.internalAdapter.createSession(otherId)).token;
    await refreshUserSessionCache(userId);
    const cached = await readCachedUser(other);
    expect(cached.username).toBe(`other_${suffix}`);
    expect(cached.usernameClaimedAt).toBeNull();
  });

  it("does not throw when the user doesn't exist", async () => {
    await expect(refreshUserSessionCache("user_missing_x")).resolves.toBeUndefined();
  });
});
