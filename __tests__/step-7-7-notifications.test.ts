/** @jest-environment node */
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import type { Actor } from "@/server/auth/session";
import { getActor } from "@/server/auth/session";
import * as emailMod from "@/server/email/send";
import {
  notify,
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  NOTIFICATION_TYPES,
} from "@/server/services/notify";
import { GET as notificationsGet } from "@/app/api/v1/notifications/route";
import { GET as unreadCountGet } from "@/app/api/v1/notifications/unread-count/route";
import { POST as markReadPost } from "@/app/api/v1/notifications/[id]/read/route";
import { POST as markAllReadPost } from "@/app/api/v1/notifications/read-all/route";
import { DELETE as dismissDelete } from "@/app/api/v1/notifications/[id]/route";
import {
  GET as prefsGet,
  PATCH as prefsPatch,
} from "@/app/api/v1/me/notification-preferences/route";
import { resetInMemoryRateLimits } from "@/server/http/rate-limit";

jest.mock("../server/auth/session", () => ({
  ...jest.requireActual("../server/auth/session"),
  getActor: jest.fn(),
}));

jest.mock("../server/email/send", () => ({
  ...jest.requireActual("../server/email/send"),
  sendEmail: jest.fn(),
}));

describe("Step 7.7 — Notifications (database, API, bell, email)", () => {
  jest.setTimeout(30000);
  const uid = () => crypto.randomBytes(6).toString("hex");

  let userA: { id: string; email: string; name: string };
  let userB: { id: string; email: string; name: string };

  const actorA = (): Actor => ({
    userId: userA.id,
    sessionId: "sess-a",
    email: userA.email,
    role: "USER",
  });

  const actorB = (): Actor => ({
    userId: userB.id,
    sessionId: "sess-b",
    email: userB.email,
    role: "USER",
  });

  beforeEach(async () => {
    resetInMemoryRateLimits();
    const suffix = uid();

    [userA, userB] = await Promise.all([
      db.user.create({
        data: {
          id: `user-a-${suffix}`,
          email: `usera-${suffix}@example.com`,
          name: "Alice Notif",
          username: `alice_n_${suffix}`,
          emailVerified: true,
        },
      }),
      db.user.create({
        data: {
          id: `user-b-${suffix}`,
          email: `userb-${suffix}@example.com`,
          name: "Bob Notif",
          username: `bob_n_${suffix}`,
          emailVerified: true,
        },
      }),
    ]);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const userIds = [userA?.id, userB?.id].filter(Boolean);
    if (userIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  test("1. Duplicates are suppressed by dedupeKey per user (while another user can receive the same dedupeKey)", async () => {
    const first = await notify(
      userA.id,
      "CREDITS_LOW",
      { remainingCredits: 15, period: "2026-11" },
      { dedupeKey: "credits_low:2026-11", email: false }
    );
    expect(first.skipped).toBe(false);
    expect(first.notification).not.toBeNull();
    expect(first.notification!.status).toBe("UNREAD");

    // Duplicate for userA with same dedupeKey -> suppressed
    const duplicate = await notify(
      userA.id,
      "CREDITS_LOW",
      { remainingCredits: 10, period: "2026-11" },
      { dedupeKey: "credits_low:2026-11", email: false }
    );
    expect(duplicate.skipped).toBe(true);
    expect(duplicate.deduped).toBe(true);
    expect(duplicate.notification).toBeNull();

    const countA = await getUnreadNotificationCount(userA.id);
    expect(countA).toBe(1);

    // Same dedupeKey for userB is allowed (uniqueness is [userId, dedupeKey])
    const forUserB = await notify(
      userB.id,
      "CREDITS_LOW",
      { remainingCredits: 18, period: "2026-11" },
      { dedupeKey: "credits_low:2026-11", email: false }
    );
    expect(forUserB.skipped).toBe(false);
    expect(forUserB.notification).not.toBeNull();
  });

  test("2. User A cannot read, mark-read, or dismiss User B's notifications (strictly own-user)", async () => {
    const notifB1 = await notify(
      userB.id,
      "INVITE_RECEIVED",
      { inviterName: "Charlie", resourceName: "Secret Workspace", role: "EDITOR" },
      { email: false }
    );
    const notifBId = notifB1.notification!.id;

    // User A creates one notification of their own
    const notifA1 = await notify(
      userA.id,
      "QUESTIONS_ANSWERED",
      { answeredCount: 3 },
      { email: false }
    );

    // List for User A only returns User A's notification
    const pageA = await listNotifications(userA.id);
    expect(pageA.items).toHaveLength(1);
    expect(pageA.items[0]!.id).toBe(notifA1.notification!.id);
    expect(JSON.stringify(pageA)).not.toContain("Secret Workspace");

    // User A attempting to mark User B's notification read -> 404
    await expect(
      markNotificationRead(userA.id, notifBId)
    ).rejects.toMatchObject({ status: 404 });

    // User A attempting to dismiss User B's notification -> 404
    await expect(
      dismissNotification(userA.id, notifBId)
    ).rejects.toMatchObject({ status: 404 });

    // User A calling markAllNotificationsRead only marks User A's notifications
    await markAllNotificationsRead(userA.id);
    expect(await getUnreadNotificationCount(userA.id)).toBe(0);
    expect(await getUnreadNotificationCount(userB.id)).toBe(1);
  });

  test("3. UserPreference per-type channels turn in-app and email notifications off/on", async () => {
    const sendEmailSpy = (emailMod.sendEmail as jest.Mock).mockResolvedValue({
      success: true,
      id: "mock-email-1",
    });

    // 1. Default preferences for SHARE_CREATED: inApp=true, email=true
    const defaultPrefs = await getUserNotificationPreferences(userA.id);
    expect(defaultPrefs.SHARE_CREATED).toEqual({ inApp: true, email: true });
    expect(NOTIFICATION_TYPES).toHaveLength(12);

    const n1 = await notify(userA.id, "SHARE_CREATED", {
      title: "Shared Doc 1",
      shareUrl: "http://localhost:3000/s/tok1",
    });
    expect(n1.skipped).toBe(false);
    expect(n1.notification!.status).toBe("UNREAD");
    expect(n1.notification!.emailStatus).toBe("SENT");
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    // 2. Turn email OFF for SHARE_CREATED (keep inApp ON)
    await updateUserNotificationPreferences(userA.id, {
      SHARE_CREATED: { inApp: true, email: false },
    });
    sendEmailSpy.mockClear();

    const n2 = await notify(userA.id, "SHARE_CREATED", {
      title: "Shared Doc 2",
      shareUrl: "http://localhost:3000/s/tok2",
    });
    expect(n2.skipped).toBe(false);
    expect(n2.notification!.status).toBe("UNREAD");
    expect(n2.notification!.emailStatus).toBe("NONE");
    expect(sendEmailSpy).not.toHaveBeenCalled();

    // 3. Turn inApp OFF and email ON for SHARE_CREATED
    await updateUserNotificationPreferences(userA.id, {
      SHARE_CREATED: { inApp: false, email: true },
    });
    sendEmailSpy.mockClear();

    const n3 = await notify(userA.id, "SHARE_CREATED", {
      title: "Shared Doc 3",
      shareUrl: "http://localhost:3000/s/tok3",
    });
    expect(n3.skipped).toBe(false);
    // Stored as DISMISSED so dedupeKey & emailStatus are tracked without showing in in-app unread count
    expect(n3.notification!.status).toBe("DISMISSED");
    expect(n3.notification!.emailStatus).toBe("SENT");
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    // 4. Turn BOTH inApp and email OFF for SHARE_CREATED -> completely skipped
    await updateUserNotificationPreferences(userA.id, {
      SHARE_CREATED: { inApp: false, email: false },
    });
    sendEmailSpy.mockClear();

    const n4 = await notify(userA.id, "SHARE_CREATED", {
      title: "Shared Doc 4",
      shareUrl: "http://localhost:3000/s/tok4",
    });
    expect(n4.skipped).toBe(true);
    expect(n4.reason).toBe("preferences_disabled");
    expect(n4.notification).toBeNull();
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  test("4. HTTP API endpoints GET /notifications, GET /unread-count, POST /:id/read, POST /read-all, DELETE /:id, and /me/notification-preferences work end-to-end", async () => {
    (getActor as jest.Mock).mockResolvedValue(actorA());

    const c1 = await notify(
      userA.id,
      "ROLE_CHANGED",
      { oldRole: "VIEWER", newRole: "EDITOR" },
      { email: false }
    );
    const c2 = await notify(
      userA.id,
      "EXPORT_READY",
      { message: "PDF export ready" },
      { email: false }
    );

    // 1. Unread count = 2
    const countRes1 = await unreadCountGet(
      new NextRequest("http://localhost:3000/api/v1/notifications/unread-count")
    );
    expect(countRes1.status).toBe(200);
    expect((await countRes1.json()).data.count).toBe(2);

    // 2. List notifications
    const listRes = await notificationsGet(
      new NextRequest("http://localhost:3000/api/v1/notifications?status=UNREAD")
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()).data;
    expect(listData.items).toHaveLength(2);

    // 3. Mark first notification read
    const readRes = await markReadPost(
      new NextRequest(
        `http://localhost:3000/api/v1/notifications/${c1.notification!.id}/read`,
        { method: "POST" }
      ),
      { params: { id: c1.notification!.id } }
    );
    expect(readRes.status).toBe(200);
    expect((await readRes.json()).data.status).toBe("READ");

    // Unread count = 1
    const countRes2 = await unreadCountGet(
      new NextRequest("http://localhost:3000/api/v1/notifications/unread-count")
    );
    expect((await countRes2.json()).data.count).toBe(1);

    // 4. Mark all read
    const readAllRes = await markAllReadPost(
      new NextRequest("http://localhost:3000/api/v1/notifications/read-all", {
        method: "POST",
      })
    );
    expect(readAllRes.status).toBe(200);
    expect((await readAllRes.json()).data.updatedCount).toBe(1);

    // 5. Dismiss second notification
    const delRes = await dismissDelete(
      new NextRequest(
        `http://localhost:3000/api/v1/notifications/${c2.notification!.id}`,
        { method: "DELETE" }
      ),
      { params: { id: c2.notification!.id } }
    );
    expect(delRes.status).toBe(200);
    expect((await delRes.json()).data.status).toBe("DISMISSED");

    // Default list excludes DISMISSED
    const listAfterDismiss = await notificationsGet(
      new NextRequest("http://localhost:3000/api/v1/notifications")
    );
    expect((await listAfterDismiss.json()).data.items).toHaveLength(1);

    // 6. Get & Patch notification preferences
    const getPrefsRes = await prefsGet(
      new NextRequest("http://localhost:3000/api/v1/me/notification-preferences")
    );
    expect(getPrefsRes.status).toBe(200);

    const patchPrefsRes = await prefsPatch(
      new NextRequest("http://localhost:3000/api/v1/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          NEW_SIGN_IN: { inApp: true, email: false },
        }),
      })
    );
    expect(patchPrefsRes.status).toBe(200);
    const patched = (await patchPrefsRes.json()).data.preferences;
    expect(patched.NEW_SIGN_IN).toEqual({ inApp: true, email: false });

    // 7. User B cannot access User A's notification via HTTP route
    (getActor as jest.Mock).mockResolvedValue(actorB());
    const crossReadRes = await markReadPost(
      new NextRequest(
        `http://localhost:3000/api/v1/notifications/${c1.notification!.id}/read`,
        { method: "POST" }
      ),
      { params: { id: c1.notification!.id } }
    );
    expect(crossReadRes.status).toBe(404);
  });
});
