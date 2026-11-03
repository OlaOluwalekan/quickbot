import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { env } from "@/server/env";
import {
  CreateSignatureOptions,
  SignedUploadPayload,
  StorageAssetMeta,
  StorageProvider,
  StorageResourceType,
} from "./types";

export class CloudinaryStorageProvider implements StorageProvider {
  public readonly name = "cloudinary";

  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async createUploadSignature(
    options: CreateSignatureOptions
  ): Promise<SignedUploadPayload> {
    if (
      !env.CLOUDINARY_CLOUD_NAME ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new Error("Cloudinary credentials are not configured");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const resourceType = options.resourceType ?? "image";
    const type = options.isPublic ? "upload" : "authenticated";

    const paramsToSign: Record<string, string | number> = {
      public_id: options.publicId,
      timestamp,
      type,
    };

    if (options.folder) {
      paramsToSign.folder = options.folder;
    }

    if (options.tags && options.tags.length > 0) {
      paramsToSign.tags = options.tags.join(",");
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      env.CLOUDINARY_API_SECRET
    );

    const uploadUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    return {
      publicId: options.publicId,
      folder: options.folder ?? "",
      signature,
      timestamp,
      apiKey: env.CLOUDINARY_API_KEY,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      uploadUrl,
      resourceType,
      type,
      maxBytes: options.maxBytes,
      allowedFormats: options.allowedFormats,
    };
  }

  async head(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<StorageAssetMeta | null> {
    const resourceType = options?.resourceType ?? "image";
    const type = options?.isPublic ? "upload" : "authenticated";

    try {
      const res = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        type,
      });

      return {
        bytes: Number(res.bytes ?? 0),
        format: String(res.format ?? ""),
        width: res.width ? Number(res.width) : undefined,
        height: res.height ? Number(res.height) : undefined,
        resourceType: String(res.resource_type ?? resourceType),
      };
    } catch (err: unknown) {
      const status = (err as { error?: { http_code?: number }; http_code?: number })
        ?.http_code ??
        (err as { error?: { http_code?: number } })?.error?.http_code;
      if (status === 404) return null;
      throw err;
    }
  }

  async delete(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<boolean> {
    const resourceType = options?.resourceType ?? "image";
    const type = options?.isPublic ? "upload" : "authenticated";

    try {
      const res = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type,
        invalidate: true,
      });
      return res.result === "ok" || res.result === "not found";
    } catch {
      return false;
    }
  }

  async privateUrl(
    publicId: string,
    options?: {
      resourceType?: StorageResourceType;
      expiresInSeconds?: number;
      format?: string;
    }
  ): Promise<string> {
    const resourceType = options?.resourceType ?? "image";
    const expiresAt =
      Math.floor(Date.now() / 1000) + (options?.expiresInSeconds ?? 300);
    const format = options?.format ?? "";

    const signedUrl = cloudinary.utils.private_download_url(
      publicId,
      format,
      {
        resource_type: resourceType,
        type: "authenticated",
        expires_at: expiresAt,
      }
    );

    return signedUrl;
  }

  publicUrl(
    publicId: string,
    options?: {
      resourceType?: StorageResourceType;
      width?: number;
      height?: number;
      crop?: string;
      format?: string;
      quality?: string;
    }
  ): string {
    const resourceType = options?.resourceType ?? "image";

    return cloudinary.url(publicId, {
      secure: true,
      resource_type: resourceType,
      type: "upload",
      width: options?.width,
      height: options?.height,
      crop: options?.crop ?? "fill",
      fetch_format: options?.format ?? "auto",
      quality: options?.quality ?? "auto",
    });
  }

  async downloadBuffer(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<Buffer> {
    const resourceType = options?.resourceType ?? "image";
    let downloadUrl: string;

    if (options?.isPublic) {
      downloadUrl = this.publicUrl(publicId, { resourceType });
    } else {
      downloadUrl = await this.privateUrl(publicId, {
        resourceType,
        expiresInSeconds: 120,
      });
    }

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch asset from Cloudinary: ${res.status} ${res.statusText}`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
