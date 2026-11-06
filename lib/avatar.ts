import { getStorageProvider } from "@/server/storage";

export * from "./avatar-shared";

export function resolveAvatarUrl(user: {
  image?: string | null;
  avatarAttachment?: { providerId: string; status?: string } | null;
  avatarAttachmentId?: string | null;
}): string | null {
  // Precedence 1: custom avatar upload
  if (user.avatarAttachment && user.avatarAttachment.status !== "DELETED") {
    try {
      const storage = getStorageProvider();
      return storage.publicUrl(user.avatarAttachment.providerId, {
        width: 256,
        height: 256,
        crop: "fill",
        gravity: "face",
        format: "auto",
        quality: "auto",
      });
    } catch {
      if (user.avatarAttachmentId) {
        return `/api/v1/attachments/${user.avatarAttachmentId}/download`;
      }
    }
  }

  // Precedence 2: provider image (Google, GitHub)
  if (user.image) {
    return user.image;
  }

  // Precedence 3: null (UI shows initials with deterministic color)
  return null;
}
