import "server-only";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import type { Actor } from "@/server/auth/session";
import { Errors } from "@/server/http/errors";
import { requireWorkspace } from "@/server/authz/access";
import { PLANS, PlanLimits } from "@/server/billing/plans";
import { getStorageProvider } from "@/server/storage";
import type { InitAttachmentInput } from "@/lib/schemas/attachment";
import type { StorageResourceType } from "@/server/storage/types";

export interface MimeDefinition {
  kind: "IMAGE" | "DOCUMENT";
  format: string;
  resourceType: StorageResourceType;
}

export const ALLOWED_MIME_TYPES: Record<string, MimeDefinition> = {
  // Images
  "image/png": { kind: "IMAGE", format: "png", resourceType: "image" },
  "image/jpeg": { kind: "IMAGE", format: "jpg", resourceType: "image" },
  "image/webp": { kind: "IMAGE", format: "webp", resourceType: "image" },
  "image/gif": { kind: "IMAGE", format: "gif", resourceType: "image" },

  // Documents
  "application/pdf": { kind: "DOCUMENT", format: "pdf", resourceType: "raw" },
  "text/plain": { kind: "DOCUMENT", format: "txt", resourceType: "raw" },
  "text/markdown": { kind: "DOCUMENT", format: "md", resourceType: "raw" },
  "text/csv": { kind: "DOCUMENT", format: "csv", resourceType: "raw" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "DOCUMENT",
    format: "docx",
    resourceType: "raw",
  },
};

/**
 * Sanitizes a filename, preventing directory traversal and null byte injections.
 */
export function sanitizeFilename(raw: string): string {
  const base =
    raw
      .replace(/[\0\r\n\t]/g, "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .pop() || "";

  const cleaned = base
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._\- ()]/g, "_")
    .trim();

  const sanitized = cleaned.slice(0, 255);
  return sanitized.length > 0 ? sanitized : `attachment_${Date.now()}`;
}

export async function getWorkspacePlanLimits(
  _workspaceOwnerId: string
): Promise<PlanLimits> {
  // Free tier default until subscription billing (Step 8.1)
  return PLANS.FREE.limits;
}

/**
 * Step 1: Initialize an attachment, validate limits/mime, create PENDING record,
 * and return signed upload parameters for direct upload to storage.
 */
export async function initAttachment(
  actor: Actor,
  input: InitAttachmentInput & { workspaceId?: string }
) {
  const sanitizedName = sanitizeFilename(input.name);
  const mimeDef = ALLOWED_MIME_TYPES[input.mime];

  if (!mimeDef) {
    throw Errors.badRequest(
      `Unsupported file type '${input.mime}'. Allowed types: PNG, JPEG, WebP, GIF, PDF, TXT, MD, CSV, DOCX.`
    );
  }

  const isAvatar = input.kind === "AVATAR";

  if (isAvatar) {
    if (mimeDef.kind !== "IMAGE") {
      throw Errors.badRequest("Avatars must be an image (PNG, JPEG, WebP)");
    }
  } else if (!input.workspaceId) {
    throw Errors.badRequest("workspaceId is required for attachments");
  }

  let folder = env.CLOUDINARY_UPLOAD_FOLDER || "klecx/dev";

  if (input.workspaceId) {
    // Check actor has upload permission in workspace
    const access = await requireWorkspace(
      actor,
      input.workspaceId,
      "workspace.upload"
    );

    // Enforce workspace plan limits
    const limits = await getWorkspacePlanLimits(access.ws.ownerId);

    const maxBytes = limits.maxFileMB * 1024 * 1024;
    if (input.bytes > maxBytes) {
      throw Errors.badRequest(
        `File size (${(input.bytes / (1024 * 1024)).toFixed(1)} MB) exceeds the ${limits.maxFileMB} MB plan limit.`
      );
    }

    const currentCount = await db.attachment.count({
      where: {
        workspaceId: input.workspaceId,
        status: { not: "DELETED" },
      },
    });

    if (currentCount >= limits.attachmentsPerWorkspace) {
      throw Errors.badRequest(
        `Workspace has reached the limit of ${limits.attachmentsPerWorkspace} attachments for your current plan.`
      );
    }

    folder = `${folder}/${input.workspaceId}`;
  } else {
    folder = `${folder}/avatars`;
  }

  // Generate random provider ID (never the user's filename)
  const uniqueId = crypto.randomUUID();
  const providerId = `${folder}/${uniqueId}`;

  // Create PENDING database record
  const attachment = await db.attachment.create({
    data: {
      ownerId: actor.userId,
      workspaceId: input.workspaceId ?? null,
      kind: input.kind,
      status: "PENDING",
      providerId,
      resourceType: mimeDef.resourceType,
      mime: input.mime,
      bytes: input.bytes,
      originalName: sanitizedName,
    },
  });

  const storage = getStorageProvider();
  const uploadPayload = await storage.createUploadSignature({
    publicId: providerId,
    folder,
    maxBytes: input.bytes + 1024 * 64, // slight leeway for transport envelope
    resourceType: mimeDef.resourceType,
    isPublic: isAvatar,
  });

  return {
    attachment,
    uploadPayload,
  };
}

/**
 * Step 2: Complete and verify an uploaded attachment.
 * Sniffs the first bytes using `file-type`, detects executable masquerading,
 * computes SHA-256 integrity hash, updates metadata, and marks READY.
 */
export async function completeAttachment(
  actor: Actor,
  attachmentId: string,
  _input?: { sha256?: string }
) {
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.deletedAt) {
    throw Errors.notFound("Attachment");
  }

  if (attachment.status === "READY") {
    return attachment;
  }

  if (attachment.status !== "PENDING") {
    throw Errors.badRequest("Attachment is not pending verification");
  }

  // Authorization check
  if (attachment.ownerId !== actor.userId) {
    if (attachment.workspaceId) {
      await requireWorkspace(actor, attachment.workspaceId, "workspace.upload");
    } else {
      throw Errors.forbidden("You do not own this attachment");
    }
  }

  const storage = getStorageProvider();
  const isAvatar = attachment.kind === "AVATAR";

  const head = await storage.head(attachment.providerId, {
    resourceType: attachment.resourceType as StorageResourceType,
    isPublic: isAvatar,
  });

  if (!head) {
    await db.attachment.update({
      where: { id: attachmentId },
      data: { status: "REJECTED" },
    });
    throw Errors.notFound("Storage asset not found in provider");
  }

  // Download buffer to verify true content type and compute SHA-256
  const buffer = await storage.downloadBuffer(attachment.providerId, {
    resourceType: attachment.resourceType as StorageResourceType,
    isPublic: isAvatar,
  });

  // Sniff magic bytes
  const detected = await fileTypeFromBuffer(buffer);

  // Check for executable signatures (e.g., .exe renamed as .png)
  const isExeHeader =
    buffer.length >= 2 &&
    ((buffer[0] === 0x4d && buffer[1] === 0x5a) || // 'MZ' Windows PE
      (buffer.length >= 4 &&
        buffer[0] === 0x7f &&
        buffer[1] === 0x45 &&
        buffer[2] === 0x4c &&
        buffer[3] === 0x46)); // ELF Linux executable

  let isValid = false;

  if (isExeHeader) {
    isValid = false;
  } else if (attachment.mime.startsWith("image/")) {
    // Expected image MIME must match detected MIME
    isValid = Boolean(detected && detected.mime === attachment.mime);
  } else if (attachment.mime === "application/pdf") {
    isValid = Boolean(detected && detected.mime === "application/pdf");
  } else if (
    attachment.mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    // DOCX is a zip-based container
    isValid = Boolean(
      detected &&
        (detected.mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          detected.mime === "application/zip")
    );
  } else if (
    attachment.mime === "text/plain" ||
    attachment.mime === "text/markdown" ||
    attachment.mime === "text/csv"
  ) {
    // Plain text files do not have binary magic bytes. Ensure no binary nulls in first 512 bytes.
    const sliceToCheck = buffer.subarray(0, Math.min(512, buffer.length));
    const hasNullByte = sliceToCheck.includes(0x00);
    isValid = !hasNullByte && detected === undefined;
  }

  if (!isValid) {
    // File content does not match reported MIME or is an executable
    await storage.delete(attachment.providerId, {
      resourceType: attachment.resourceType as StorageResourceType,
      isPublic: isAvatar,
    });

    await db.attachment.update({
      where: { id: attachmentId },
      data: { status: "REJECTED" },
    });

    throw Errors.badRequest(
      "Uploaded file content does not match reported MIME type or is prohibited"
    );
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const updated = await db.attachment.update({
    where: { id: attachmentId },
    data: {
      status: "READY",
      bytes: head.bytes || buffer.byteLength,
      width: head.width ?? null,
      height: head.height ?? null,
      sha256,
    },
  });

  return updated;
}

/**
 * Step 3: Returns a secure, expiring signed URL for private attachments,
 * or a transformation URL for public avatars.
 * User B cannot get a URL for User A's attachment (returns 404).
 */
export async function getAttachmentUrl(
  actor: Actor,
  attachmentId: string,
  expiresInSeconds = 300
) {
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.deletedAt || attachment.status !== "READY") {
    throw Errors.notFound("Attachment");
  }

  const storage = getStorageProvider();

  // Public Avatars
  if (attachment.kind === "AVATAR") {
    const url = storage.publicUrl(attachment.providerId, {
      resourceType: attachment.resourceType as StorageResourceType,
      width: 256,
      height: 256,
      crop: "fill",
    });
    return { url, expiresIn: null };
  }

  // Workspace authorization: if actor cannot read workspace, throw 404 (no existence leak)
  if (attachment.workspaceId) {
    try {
      await requireWorkspace(actor, attachment.workspaceId, "workspace.read");
    } catch {
      throw Errors.notFound("Attachment");
    }
  } else if (attachment.ownerId !== actor.userId) {
    throw Errors.notFound("Attachment");
  }

  const signedUrl = await storage.privateUrl(attachment.providerId, {
    resourceType: attachment.resourceType as StorageResourceType,
    expiresInSeconds,
    format: ALLOWED_MIME_TYPES[attachment.mime]?.format,
  });

  return {
    url: signedUrl,
    expiresIn: expiresInSeconds,
  };
}

/**
 * Step 4: Deletes an attachment record and removes the asset from storage.
 */
export async function deleteAttachment(actor: Actor, attachmentId: string) {
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.deletedAt) {
    throw Errors.notFound("Attachment");
  }

  if (attachment.ownerId !== actor.userId) {
    if (attachment.workspaceId) {
      await requireWorkspace(actor, attachment.workspaceId, "workspace.delete");
    } else {
      throw Errors.forbidden("You cannot delete this attachment");
    }
  }

  const storage = getStorageProvider();
  await storage.delete(attachment.providerId, {
    resourceType: attachment.resourceType as StorageResourceType,
    isPublic: attachment.kind === "AVATAR",
  });

  await db.attachment.update({
    where: { id: attachmentId },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * List attachments for a workspace.
 */
export async function listWorkspaceAttachments(
  actor: Actor,
  workspaceId: string
) {
  await requireWorkspace(actor, workspaceId, "workspace.read");

  return db.attachment.findMany({
    where: {
      workspaceId,
      status: "READY",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      originalName: true,
      mime: true,
      bytes: true,
      width: true,
      height: true,
      createdAt: true,
    },
  });
}
