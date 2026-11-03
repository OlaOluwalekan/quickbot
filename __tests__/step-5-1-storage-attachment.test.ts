/**
 * @jest-environment node
 */

const mockGetActor = jest.fn();

jest.mock("../server/auth/session", () => ({
  getActor: (...args: unknown[]) => mockGetActor(...args),
  requireActor: (...args: unknown[]) => mockGetActor(...args),
}));

jest.mock("../server/auth/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

const mockDbAttachment = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
};

const mockDbWorkspace = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
};

jest.mock("../server/db/client", () => {
  return {
    db: {
      attachment: {
        create: (...args: unknown[]) => mockDbAttachment.create(...args),
        findUnique: (...args: unknown[]) => mockDbAttachment.findUnique(...args),
        findFirst: (...args: unknown[]) => mockDbAttachment.findFirst(...args),
        findMany: (...args: unknown[]) => mockDbAttachment.findMany(...args),
        update: (...args: unknown[]) => mockDbAttachment.update(...args),
        count: (...args: unknown[]) => mockDbAttachment.count(...args),
      },
      workspace: {
        findFirst: (...args: unknown[]) => mockDbWorkspace.findFirst(...args),
        findUnique: (...args: unknown[]) => mockDbWorkspace.findUnique(...args),
      },
    },
  };
});

import { NextRequest } from "next/server";
import { MockStorageProvider } from "@/server/storage/mock";
import { CloudinaryStorageProvider } from "@/server/storage/cloudinary";
import { getStorageProvider, setStorageProvider } from "@/server/storage/provider";
import {
  initAttachment,
  completeAttachment,
  getAttachmentUrl,
  deleteAttachment,
  sanitizeFilename,
  ALLOWED_MIME_TYPES,
} from "@/server/services/attachment";
import { POST as initRoute } from "@/app/api/v1/workspaces/[id]/attachments/init/route";
import { POST as completeRoute } from "@/app/api/v1/attachments/[id]/complete/route";
import { GET as urlRoute } from "@/app/api/v1/attachments/[id]/url/route";
import { DELETE as deleteRoute } from "@/app/api/v1/attachments/[id]/route";
import type { Actor } from "@/server/auth/session";

describe("Step 5.1 — Storage Provider (Cloudinary) and Attachment Model", () => {
  let mockStorage: MockStorageProvider;

  const userA: Actor = {
    userId: "user_a",
    email: "usera@example.com",
    role: "USER",
    sessionId: "sess_a",
  };

  const userB: Actor = {
    userId: "user_b",
    email: "userb@example.com",
    role: "USER",
    sessionId: "sess_b",
  };

  // Valid 1x1 PNG buffer
  const samplePngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  // Valid minimal PDF buffer (%PDF-1.4)
  const samplePdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n"
  );

  // Executable file disguised as PNG (starts with 'MZ')
  const sampleExeBuffer = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    0xff, 0xff, 0x00, 0x00, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage = new MockStorageProvider();
    setStorageProvider(mockStorage);
    mockGetActor.mockResolvedValue(userA);
  });

  afterAll(() => {
    setStorageProvider(null);
  });

  describe("1. Storage Provider Abstraction & Providers", () => {
    it("MockStorageProvider adheres to StorageProvider interface", async () => {
      const provider = getStorageProvider();
      expect(provider.name).toBe("mock");

      const sig = await provider.createUploadSignature({
        publicId: "folder/test-id",
        folder: "folder",
        maxBytes: 1024,
        resourceType: "image",
      });

      expect(sig.publicId).toBe("folder/test-id");
      expect(sig.type).toBe("authenticated");
      expect(sig.uploadUrl).toContain("mock.storage.local");
      expect(sig.signature).toBeTruthy();

      mockStorage.seedFile("folder/test-id", samplePngBuffer, {
        bytes: samplePngBuffer.length,
        format: "png",
        width: 1,
        height: 1,
        resourceType: "image",
      });

      const head = await provider.head("folder/test-id");
      expect(head).toEqual({
        bytes: samplePngBuffer.length,
        format: "png",
        width: 1,
        height: 1,
        resourceType: "image",
      });

      const privateUrl = await provider.privateUrl("folder/test-id", {
        expiresInSeconds: 300,
      });
      expect(privateUrl).toContain("expires=");
      expect(privateUrl).toContain("sig=");

      const publicUrl = provider.publicUrl("folder/test-id", {
        width: 256,
        height: 256,
      });
      expect(publicUrl).toContain("w_256,h_256");

      const buf = await provider.downloadBuffer("folder/test-id");
      expect(buf).toEqual(samplePngBuffer);

      const deleted = await provider.delete("folder/test-id");
      expect(deleted).toBe(true);
      expect(await provider.head("folder/test-id")).toBeNull();
    });

    it("CloudinaryStorageProvider generates signed authenticated upload parameters", async () => {
      const cloudinary = new CloudinaryStorageProvider({
        cloudName: "demo_cloud",
        apiKey: "demo_key",
        apiSecret: "demo_secret",
      });
      expect(cloudinary.name).toBe("cloudinary");

      const sig = await cloudinary.createUploadSignature({
        publicId: "klecx/workspaces/ws1/asset1",
        folder: "klecx/workspaces/ws1",
        resourceType: "image",
      });

      expect(sig.publicId).toBe("klecx/workspaces/ws1/asset1");
      expect(sig.type).toBe("authenticated");
      expect(sig.uploadUrl).toContain("api.cloudinary.com/v1_1/demo_cloud");
      expect(sig.signature).toBeTruthy();
      expect(sig.timestamp).toBeGreaterThan(0);
    });

    it("CloudinaryStorageProvider throws when credentials are not configured", async () => {
      const unconfigured = new CloudinaryStorageProvider({
        cloudName: "",
        apiKey: "",
        apiSecret: "",
      });

      await expect(
        unconfigured.createUploadSignature({
          publicId: "klecx/workspaces/ws1/asset1",
        })
      ).rejects.toThrow("Cloudinary credentials are not configured");
    });
  });

  describe("2. Filename Sanitization & Allowed Types", () => {
    it("sanitizes filenames stripping path traversals, null bytes, and unsafe characters", () => {
      expect(sanitizeFilename("../../../etc/passwd")).toBe("passwd");
      expect(sanitizeFilename("foo\0bar.png")).toBe("foobar.png");
      expect(sanitizeFilename("my picture (1).PNG")).toBe("my picture (1).PNG");
      expect(sanitizeFilename("...hidden.pdf")).toBe("hidden.pdf");
      expect(sanitizeFilename("")).toContain("attachment_");
    });

    it("defines allowed image and document MIME types and disallows SVG and executables", () => {
      expect(ALLOWED_MIME_TYPES["image/png"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["image/jpeg"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["image/webp"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["image/gif"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["application/pdf"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["text/plain"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["text/markdown"]).toBeDefined();
      expect(ALLOWED_MIME_TYPES["text/csv"]).toBeDefined();
      expect(
        ALLOWED_MIME_TYPES[
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ]
      ).toBeDefined();

      // Prohibited types
      expect((ALLOWED_MIME_TYPES as Record<string, unknown>)["image/svg+xml"]).toBeUndefined();
      expect((ALLOWED_MIME_TYPES as Record<string, unknown>)["application/x-msdownload"]).toBeUndefined();
      expect((ALLOWED_MIME_TYPES as Record<string, unknown>)["application/zip"]).toBeUndefined();
    });
  });

  describe("3. Attachment Initialization & Plan Limits", () => {
    it("rejects unsupported MIME types with 400 Bad Request", async () => {
      await expect(
        initAttachment(userA, {
          workspaceId: "ws_123",
          name: "malicious.svg",
          mime: "image/svg+xml",
          bytes: 1024,
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("Unsupported file type"),
      });
    });

    it("rejects files exceeding Free plan file size limit (5 MB)", async () => {
      mockDbWorkspace.findFirst.mockResolvedValue({
        id: "ws_123",
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
      });

      const sixMb = 6 * 1024 * 1024;
      await expect(
        initAttachment(userA, {
          workspaceId: "ws_123",
          name: "large.png",
          mime: "image/png",
          bytes: sixMb,
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("exceeds the 5 MB plan limit"),
      });
    });

    it("rejects uploads when workspace reaches Free plan attachment count limit (3 attachments)", async () => {
      mockDbWorkspace.findFirst.mockResolvedValue({
        id: "ws_123",
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
      });
      mockDbAttachment.count.mockResolvedValue(3);

      await expect(
        initAttachment(userA, {
          workspaceId: "ws_123",
          name: "fourth.png",
          mime: "image/png",
          bytes: 1024,
          kind: "IMAGE",
        })
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("reached the limit of 3 attachments"),
      });
    });

    it("creates PENDING attachment with random providerId and returns signed upload payload", async () => {
      mockDbWorkspace.findFirst.mockResolvedValue({
        id: "ws_123",
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
      });
      mockDbAttachment.count.mockResolvedValue(1);

      mockDbAttachment.create.mockImplementation(({ data }) => ({
        id: "att_123",
        ...data,
        createdAt: new Date(),
      }));

      const result = await initAttachment(userA, {
        workspaceId: "ws_123",
        name: "my_diagram.png",
        mime: "image/png",
        bytes: 1024,
        kind: "IMAGE",
      });

      expect(result.attachment.id).toBe("att_123");
      expect(result.attachment.status).toBe("PENDING");
      expect(result.attachment.providerId).toContain("ws_123");
      // Must not leak the original filename into the provider public_id
      expect(result.attachment.providerId).not.toContain("my_diagram");
      expect(result.uploadPayload.type).toBe("authenticated");
      expect(result.uploadPayload.signature).toBeTruthy();
    });

    it("supports public AVATAR initialization without workspaceId", async () => {
      mockDbAttachment.create.mockImplementation(({ data }) => ({
        id: "att_avatar",
        ...data,
        createdAt: new Date(),
      }));

      const result = await initAttachment(userA, {
        name: "avatar.png",
        mime: "image/png",
        bytes: 2048,
        kind: "AVATAR",
      });

      expect(result.attachment.kind).toBe("AVATAR");
      expect(result.attachment.workspaceId).toBeNull();
      expect(result.uploadPayload.type).toBe("upload");
    });
  });

  describe("4. Verification & Disguised File Rejection", () => {
    it("completes valid PNG upload, verifies magic bytes, and marks READY with sha256", async () => {
      const publicId = "klecx/dev/ws_123/asset_valid";
      mockStorage.seedFile(publicId, samplePngBuffer, {
        bytes: samplePngBuffer.length,
        format: "png",
        width: 1,
        height: 1,
        resourceType: "image",
      });

      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_valid",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "PENDING",
        providerId: publicId,
        resourceType: "image",
        mime: "image/png",
        bytes: samplePngBuffer.length,
        kind: "IMAGE",
      });

      mockDbAttachment.update.mockImplementation(({ data }) => ({
        id: "att_valid",
        status: data.status,
        sha256: data.sha256,
        bytes: data.bytes,
      }));

      const completed = await completeAttachment(userA, "att_valid");
      expect(completed.status).toBe("READY");
      expect(completed.sha256).toBeTruthy();
      expect(mockDbAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "READY",
            sha256: expect.any(String),
          }),
        })
      );
    });

    it("rejects an executable disguised as a PNG (.exe renamed to .png) and deletes asset from storage", async () => {
      const publicId = "klecx/dev/ws_123/asset_trojan";
      mockStorage.seedFile(publicId, sampleExeBuffer, {
        bytes: sampleExeBuffer.length,
        format: "png",
        resourceType: "image",
      });

      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_trojan",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "PENDING",
        providerId: publicId,
        resourceType: "image",
        mime: "image/png",
        bytes: sampleExeBuffer.length,
        kind: "IMAGE",
      });

      await expect(completeAttachment(userA, "att_trojan")).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining("does not match reported MIME type"),
      });

      // Asset must be purged from storage
      expect(mockStorage.hasFile(publicId)).toBe(false);
      // Status in DB must be updated to REJECTED
      expect(mockDbAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "REJECTED" }),
        })
      );
    });

    it("completes valid PDF document upload", async () => {
      const publicId = "klecx/dev/ws_123/doc_valid";
      mockStorage.seedFile(publicId, samplePdfBuffer, {
        bytes: samplePdfBuffer.length,
        format: "pdf",
        resourceType: "raw",
      });

      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_pdf",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "PENDING",
        providerId: publicId,
        resourceType: "raw",
        mime: "application/pdf",
        bytes: samplePdfBuffer.length,
        kind: "DOCUMENT",
      });

      mockDbAttachment.update.mockImplementation(({ data }) => ({
        id: "att_pdf",
        status: data.status,
      }));

      const completed = await completeAttachment(userA, "att_pdf");
      expect(completed.status).toBe("READY");
    });
  });

  describe("5. Private Delivery, Authorization & Isolation", () => {
    it("returns expiring signed URL for workspace member", async () => {
      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_ready",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "READY",
        deletedAt: null,
        providerId: "klecx/dev/ws_123/uuid1",
        resourceType: "image",
        mime: "image/png",
        kind: "IMAGE",
      });

      mockDbWorkspace.findFirst.mockResolvedValue({
        id: "ws_123",
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
      });

      const { url, expiresIn } = await getAttachmentUrl(userA, "att_ready", 300);
      expect(url).toContain("expires=");
      expect(expiresIn).toBe(300);
    });

    it("returns 404 (isolation / no existence leak) when User B attempts to access User A's attachment", async () => {
      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_ready",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "READY",
        deletedAt: null,
        providerId: "klecx/dev/ws_123/uuid1",
        resourceType: "image",
        mime: "image/png",
        kind: "IMAGE",
      });

      // User B has no access to workspace ws_123
      mockDbWorkspace.findFirst.mockResolvedValue(null);

      await expect(getAttachmentUrl(userB, "att_ready")).rejects.toMatchObject({
        status: 404,
        message: expect.stringContaining("Attachment not found"),
      });
    });

    it("returns public transformation URL for AVATAR kind", async () => {
      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_avatar",
        ownerId: userA.userId,
        workspaceId: null,
        status: "READY",
        deletedAt: null,
        providerId: "klecx/dev/avatars/user_a",
        resourceType: "image",
        mime: "image/png",
        kind: "AVATAR",
      });

      const { url, expiresIn } = await getAttachmentUrl(userB, "att_avatar");
      expect(url).toContain("w_256,h_256");
      expect(expiresIn).toBeNull();
    });

    it("deletes attachment from DB and destroys asset in storage provider", async () => {
      const publicId = "klecx/dev/ws_123/asset_to_delete";
      mockStorage.seedFile(publicId, samplePngBuffer);

      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_to_delete",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "READY",
        deletedAt: null,
        providerId: publicId,
        resourceType: "image",
        kind: "IMAGE",
      });

      const res = await deleteAttachment(userA, "att_to_delete");
      expect(res.success).toBe(true);
      expect(mockStorage.hasFile(publicId)).toBe(false);
      expect(mockDbAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "att_to_delete" },
          data: expect.objectContaining({
            status: "DELETED",
            deletedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe("6. API Route Handlers", () => {
    it("POST /api/v1/workspaces/[id]/attachments/init handles signed upload init", async () => {
      mockDbWorkspace.findFirst.mockResolvedValue({
        id: "ws_123",
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
      });
      mockDbAttachment.count.mockResolvedValue(0);
      mockDbAttachment.create.mockResolvedValue({
        id: "att_api",
        status: "PENDING",
        providerId: "klecx/dev/ws_123/uuid_api",
        mime: "image/png",
        bytes: 1024,
      });

      const req = new NextRequest("http://localhost/api/v1/workspaces/ws_123/attachments/init", {
        method: "POST",
        body: JSON.stringify({
          name: "chart.png",
          mime: "image/png",
          bytes: 1024,
          kind: "IMAGE",
        }),
      });

      const res = await initRoute(req, { params: Promise.resolve({ id: "ws_123" }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.attachment.id).toBe("att_api");
      expect(json.uploadPayload.signature).toBeTruthy();
    });

    it("POST /api/v1/attachments/[id]/complete verifies and completes attachment", async () => {
      const publicId = "klecx/dev/ws_123/uuid_api";
      mockStorage.seedFile(publicId, samplePngBuffer, {
        bytes: samplePngBuffer.length,
        format: "png",
      });

      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_api",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "PENDING",
        providerId: publicId,
        resourceType: "image",
        mime: "image/png",
        bytes: samplePngBuffer.length,
        kind: "IMAGE",
      });

      mockDbAttachment.update.mockResolvedValue({
        id: "att_api",
        status: "READY",
        sha256: "some_sha",
      });

      const req = new NextRequest("http://localhost/api/v1/attachments/att_api/complete", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await completeRoute(req, { params: Promise.resolve({ id: "att_api" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.attachment.status).toBe("READY");
    });

    it("GET /api/v1/attachments/[id]/url returns signed URL", async () => {
      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_api",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "READY",
        deletedAt: null,
        providerId: "klecx/dev/ws_123/uuid_api",
        resourceType: "image",
        mime: "image/png",
        kind: "IMAGE",
      });

      mockDbWorkspace.findFirst.mockResolvedValue({
        id: "ws_123",
        ownerId: userA.userId,
        projectId: null,
        archivedAt: null,
      });

      const req = new NextRequest("http://localhost/api/v1/attachments/att_api/url", {
        method: "GET",
      });

      const res = await urlRoute(req, { params: Promise.resolve({ id: "att_api" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.url).toContain("expires=");
    });

    it("DELETE /api/v1/attachments/[id] deletes attachment", async () => {
      mockDbAttachment.findUnique.mockResolvedValue({
        id: "att_api",
        ownerId: userA.userId,
        workspaceId: "ws_123",
        status: "READY",
        deletedAt: null,
        providerId: "klecx/dev/ws_123/uuid_api",
        resourceType: "image",
        kind: "IMAGE",
      });
      mockDbAttachment.update.mockResolvedValue({});

      const req = new NextRequest("http://localhost/api/v1/attachments/att_api", {
        method: "DELETE",
      });

      const res = await deleteRoute(req, { params: Promise.resolve({ id: "att_api" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
