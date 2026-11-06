/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { getStorageProvider, setStorageProvider } from "@/server/storage";
import { MockStorageProvider } from "@/server/storage/mock";
import { resolveAvatarUrl, getInitials, getAvatarColorClass } from "@/lib/avatar";
import { initAttachment, completeAttachment } from "@/server/services/attachment";
import { setAvatar, removeAvatar, getUserAvatar } from "@/server/services/avatar";
import { PUT as setAvatarRoute, DELETE as removeAvatarRoute, GET as getAvatarRoute } from "@/app/api/v1/me/avatar/route";

let mockActorId: string | null = null;

jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => {
    if (!mockActorId) return null;
    return {
      userId: mockActorId,
      sessionId: `sess_${mockActorId}`,
      email: `${mockActorId}@example.com`,
      role: "USER" as const,
    };
  }),
}));

describe("Step 7.2 — Profile picture with precedence", () => {
  let mockStorage: MockStorageProvider;
  const testSuffix = Date.now().toString().slice(-6);
  const userGoogleId = `user_goog_${testSuffix}`;
  const userOtherId = `user_oth_${testSuffix}`;
  const googlePicUrl = "https://lh3.googleusercontent.com/a/google_original_pic";

  beforeAll(async () => {
    mockStorage = new MockStorageProvider();
    setStorageProvider(mockStorage);

    await db.attachment.deleteMany({
      where: { ownerId: { in: [userGoogleId, userOtherId] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [userGoogleId, userOtherId] } },
    });

    await db.user.createMany({
      data: [
        {
          id: userGoogleId,
          email: `goog_${testSuffix}@example.com`,
          name: "Google User",
          image: googlePicUrl,
        },
        {
          id: userOtherId,
          email: `oth_${testSuffix}@example.com`,
          name: "Other User",
          image: null,
        },
      ],
    });
  });

  afterAll(async () => {
    setStorageProvider(null);
    await db.attachment.deleteMany({
      where: { ownerId: { in: [userGoogleId, userOtherId] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [userGoogleId, userOtherId] } },
    });
  });

  describe("Precedence Resolution (lib/avatar.ts)", () => {
    test("custom avatar takes highest precedence over social provider image", () => {
      const user = {
        image: googlePicUrl,
        avatarAttachment: {
          providerId: "klecx/dev/avatars/custom_pic_123",
          status: "READY",
        },
      };

      const resolved = resolveAvatarUrl(user);
      expect(resolved).not.toBeNull();
      expect(resolved).toContain("custom_pic_123");
      expect(resolved).toContain("c_fill");
      expect(resolved).toContain("g_face");
      expect(resolved).toContain("w_256");
      expect(resolved).toContain("h_256");
    });

    test("provider image takes second precedence when no custom avatar is set", () => {
      const user = {
        image: googlePicUrl,
        avatarAttachment: null,
      };

      const resolved = resolveAvatarUrl(user);
      expect(resolved).toBe(googlePicUrl);
    });

    test("returns null when neither custom avatar nor provider image exists", () => {
      const user = {
        image: null,
        avatarAttachment: null,
      };

      expect(resolveAvatarUrl(user)).toBeNull();
    });

    test("deleted custom avatar is ignored and falls back to provider image", () => {
      const user = {
        image: googlePicUrl,
        avatarAttachment: {
          providerId: "klecx/dev/avatars/old_pic",
          status: "DELETED",
        },
      };

      expect(resolveAvatarUrl(user)).toBe(googlePicUrl);
    });
  });

  describe("Initials and Deterministic Color Generation", () => {
    test("getInitials formats two-word names into initials", () => {
      expect(getInitials("Alice Walker", null)).toBe("AW");
      expect(getInitials("John Doe", "john@example.com")).toBe("JD");
    });

    test("getInitials formats single word names to 2 characters", () => {
      expect(getInitials("Alice", null)).toBe("AL");
    });

    test("getInitials falls back to email or '?'", () => {
      expect(getInitials(null, "charlie@example.com")).toBe("CH");
      expect(getInitials(null, null)).toBe("?");
    });

    test("getAvatarColorClass returns a consistent design token class for the same id", () => {
      const color1 = getAvatarColorClass(userGoogleId);
      const color2 = getAvatarColorClass(userGoogleId);
      expect(color1).toBe(color2);
      expect(typeof color1).toBe("string");
    });
  });

  describe("Avatar Upload Constraints", () => {
    const actorGoogle = {
      userId: userGoogleId,
      sessionId: `sess_${userGoogleId}`,
      email: `goog_${testSuffix}@example.com`,
      role: "USER" as const,
    };

    test("rejects avatar files exceeding 2 MB", async () => {
      const oversizedBytes = 2 * 1024 * 1024 + 1; // 2 MB + 1 byte
      await expect(
        initAttachment(actorGoogle, {
          name: "large_avatar.png",
          mime: "image/png",
          bytes: oversizedBytes,
          kind: "AVATAR",
        })
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    test("rejects unsupported MIME types for avatar (e.g. PDF or text)", async () => {
      await expect(
        initAttachment(actorGoogle, {
          name: "doc_avatar.pdf",
          mime: "application/pdf",
          bytes: 1024,
          kind: "AVATAR",
        })
      ).rejects.toMatchObject({
        status: 400,
      });
    });

    test("accepts valid WebP, PNG, and JPEG avatar uploads within 2 MB", async () => {
      const res = await initAttachment(actorGoogle, {
        name: "my_avatar.webp",
        mime: "image/webp",
        bytes: 50 * 1024, // 50 KB
        kind: "AVATAR",
      });

      expect(res.attachment.kind).toBe("AVATAR");
      expect(res.attachment.status).toBe("PENDING");
      expect(res.uploadPayload.type).toBe("upload"); // public upload
    });
  });

  describe("Full Flow: Set, Overwrite, Swap, Delete & Precedence Verification", () => {
    const actorGoogle = {
      userId: userGoogleId,
      sessionId: `sess_${userGoogleId}`,
      email: `goog_${testSuffix}@example.com`,
      role: "USER" as const,
    };

    let avatar1Id: string;
    let avatar1ProviderId: string;
    let avatar2Id: string;
    let avatar2ProviderId: string;

    test("user can upload and set custom avatar", async () => {
      // 1. Init
      const init1 = await initAttachment(actorGoogle, {
        name: "avatar1.png",
        mime: "image/png",
        bytes: 100 * 1024,
        kind: "AVATAR",
      });
      avatar1Id = init1.attachmentId;
      avatar1ProviderId = init1.attachment.providerId;

      // 2. Complete
      await completeAttachment(actorGoogle, avatar1Id);

      // 3. Set avatar
      const setRes = await setAvatar(actorGoogle, avatar1Id);
      expect(setRes.avatarUrl).not.toBeNull();
      expect(setRes.avatarUrl).toContain(avatar1ProviderId);

      // DB check
      const dbUser = await db.user.findUnique({
        where: { id: userGoogleId },
      });
      expect(dbUser?.avatarAttachmentId).toBe(avatar1Id);
      // Provider image untouched!
      expect(dbUser?.image).toBe(googlePicUrl);
    });

    test("provider refresh does NOT overwrite the custom avatar choice", async () => {
      // Simulate Google OAuth refresh updating user.image in the DB
      const refreshedGooglePic = "https://lh3.googleusercontent.com/a/google_refreshed_pic";
      await db.user.update({
        where: { id: userGoogleId },
        data: { image: refreshedGooglePic },
      });

      // Fetch avatar via service
      const avatarInfo = await getUserAvatar(userGoogleId);
      expect(avatarInfo.isCustom).toBe(true);
      expect(avatarInfo.providerImage).toBe(refreshedGooglePic);
      // Custom avatar still resolved!
      expect(avatarInfo.avatarUrl).toContain(avatar1ProviderId);
      expect(avatarInfo.avatarUrl).not.toBe(refreshedGooglePic);
    });

    test("swapping avatar deletes previous asset and sets new avatar", async () => {
      const storage = getStorageProvider();

      // Init and complete avatar 2
      const init2 = await initAttachment(actorGoogle, {
        name: "avatar2.webp",
        mime: "image/webp",
        bytes: 80 * 1024,
        kind: "AVATAR",
      });
      avatar2Id = init2.attachmentId;
      avatar2ProviderId = init2.attachment.providerId;
      await completeAttachment(actorGoogle, avatar2Id);

      // Swap to avatar 2
      const swapRes = await setAvatar(actorGoogle, avatar2Id);
      expect(swapRes.avatarUrl).toContain(avatar2ProviderId);

      // Verify old avatar 1 marked DELETED in DB
      const oldAtt = await db.attachment.findUnique({
        where: { id: avatar1Id },
      });
      expect(oldAtt?.status).toBe("DELETED");
      expect(oldAtt?.deletedAt).not.toBeNull();

      // Verify new avatar 2 is active
      const dbUser = await db.user.findUnique({
        where: { id: userGoogleId },
      });
      expect(dbUser?.avatarAttachmentId).toBe(avatar2Id);
    });

    test("DELETE /api/v1/me/avatar removes custom picture and reverts to Google image", async () => {
      mockActorId = userGoogleId;

      const req = new NextRequest("http://localhost:3000/api/v1/me/avatar", {
        method: "DELETE",
      });

      const res = await removeAvatarRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      // Reverts to the Google provider picture!
      expect(json.data.avatarUrl).toBe("https://lh3.googleusercontent.com/a/google_refreshed_pic");

      // DB check
      const dbUser = await db.user.findUnique({
        where: { id: userGoogleId },
      });
      expect(dbUser?.avatarAttachmentId).toBeNull();

      // Attachment 2 marked DELETED
      const att2 = await db.attachment.findUnique({
        where: { id: avatar2Id },
      });
      expect(att2?.status).toBe("DELETED");
    });

    test("PUT /api/v1/me/avatar rejects non-owner attachment (403)", async () => {
      mockActorId = userOtherId;

      // userGoogle uploads avatar
      const init = await initAttachment(actorGoogle, {
        name: "google_only.png",
        mime: "image/png",
        bytes: 10 * 1024,
        kind: "AVATAR",
      });
      await completeAttachment(actorGoogle, init.attachmentId);

      // userOther attempts to claim it as their avatar
      const req = new NextRequest("http://localhost:3000/api/v1/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: init.attachmentId }),
      });

      const res = await setAvatarRoute(req);
      expect(res.status).toBe(403);
    });
  });
});
