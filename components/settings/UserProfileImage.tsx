"use client";

import * as React from "react";
import { SessionProps } from "@/types/user";
import { UserAvatar } from "@/components/user/user-avatar";
import { AvatarCropDialog } from "@/components/user/avatar-crop-dialog";
import { Button } from "@/components/ui/button";
import { Camera, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export interface UserProfileImageProps {
  user: SessionProps;
  avatarUrl?: string | null;
  isCustomAvatar?: boolean;
}

export function UserProfileImage({
  user,
  avatarUrl: initialAvatarUrl,
  isCustomAvatar: initialIsCustom = false,
}: UserProfileImageProps) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [currentAvatarUrl, setCurrentAvatarUrl] = React.useState<string | null>(
    initialAvatarUrl ?? user.image ?? null
  );
  const [isCustom, setIsCustom] = React.useState(initialIsCustom);
  const [cropDialogOpen, setCropDialogOpen] = React.useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  // Check if custom avatar exists on mount
  React.useEffect(() => {
    fetch("/api/v1/me/avatar")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        const data = body?.data ?? body;
        if (data) {
          if (data.avatarUrl) setCurrentAvatarUrl(data.avatarUrl);
          if (typeof data.isCustom === "boolean") setIsCustom(data.isCustom);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so re-selecting same file triggers onChange
    e.target.value = "";

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Avatar must be a PNG, JPEG, or WebP image");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar image must be 2 MB or less");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageSrc(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setIsUploading(true);
    try {
      // Use the blob's real type: some browsers (e.g. Safari) ignore the
      // requested "image/webp" in canvas.toBlob and silently emit PNG.
      const mime = ["image/png", "image/jpeg", "image/webp"].includes(croppedBlob.type)
        ? croppedBlob.type
        : "image/png";
      const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
      const fileName = `avatar.${ext}`;

      // 1. Initialize avatar attachment
      const initRes = await fetch("/api/v1/attachments/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fileName,
          mime,
          bytes: croppedBlob.size,
          kind: "AVATAR",
        }),
      });

      if (!initRes.ok) {
        throw new Error("Failed to initialize avatar upload");
      }

      const initData = await initRes.json();
      const attachmentId = initData.attachmentId || initData.data?.attachmentId || initData.attachment?.id;
      const uploadPayload = initData.uploadPayload || initData.data?.uploadPayload;

      // 2. Direct upload to Cloudinary (mock storage uses a non-routable URL)
      const isMockUpload =
        typeof uploadPayload?.uploadUrl === "string" &&
        uploadPayload.uploadUrl.includes("mock.storage.local");

      if (uploadPayload && !isMockUpload) {
        const formData = new FormData();
        formData.append("file", croppedBlob, fileName);
        formData.append("api_key", uploadPayload.apiKey);
        formData.append("timestamp", String(uploadPayload.timestamp));
        formData.append("signature", uploadPayload.signature);
        formData.append("public_id", uploadPayload.publicId);
        formData.append("type", uploadPayload.type);
        if (uploadPayload.folder) formData.append("folder", uploadPayload.folder);

        const uploadRes = await fetch(uploadPayload.uploadUrl, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          throw new Error("Failed to upload avatar image");
        }
      }

      // Mock storage (local dev without Cloudinary) needs the bytes inline
      const completeBody: Record<string, string> = {};
      if (isMockUpload) {
        completeBody.mockBase64 = await blobToBase64(croppedBlob);
      }

      // 3. Complete attachment
      const completeRes = await fetch(`/api/v1/attachments/${attachmentId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeBody),
      });

      if (!completeRes.ok) {
        throw new Error("Failed to verify avatar attachment");
      }

      // 4. Set user avatar
      const setAvatarRes = await fetch("/api/v1/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId }),
      });

      if (!setAvatarRes.ok) {
        throw new Error("Failed to save avatar");
      }

      const setAvatarData = await setAvatarRes.json();
      const newUrl = setAvatarData.avatarUrl ?? setAvatarData.data?.avatarUrl;

      setCurrentAvatarUrl(newUrl);
      setIsCustom(true);
      toast.success("Profile picture updated");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile picture";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setIsUploading(true);
    try {
      const res = await fetch("/api/v1/me/avatar", {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to remove avatar");
      }

      const body = await res.json();
      const newUrl = body.avatarUrl ?? body.data?.avatarUrl ?? user.image ?? null;

      setCurrentAvatarUrl(newUrl);
      setIsCustom(false);
      toast.success("Reverted to social provider picture");
      router.refresh();
    } catch {
      toast.error("Failed to remove avatar");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative group">
        <UserAvatar
          avatarUrl={currentAvatarUrl}
          name={user.name}
          email={user.email}
          userId={user.id}
          size="xl"
          className="h-20 w-20 ring-2 ring-border shadow-sm"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-overlay/50 text-accent-fg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
          aria-label="Upload profile picture"
        >
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-2 items-center sm:items-start text-center sm:text-left">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="gap-1.5"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Change picture
          </Button>

          {isCustom && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRemoveAvatar}
              disabled={isUploading}
              className="gap-1.5 text-danger hover:text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>

        <p className="text-xs text-subtle">
          Allowed: PNG, JPEG, or WebP. Max 2 MB. Square cropped (512×512).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <AvatarCropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={selectedImageSrc}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

export default UserProfileImage;
