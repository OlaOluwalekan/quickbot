import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { env } from "@/server/env";
import {
  CreateSignatureOptions,
  SignedUploadPayload,
  StorageAssetMeta,
  StorageProvider,
  StorageResourceType,
  UploadBufferOptions,
  UploadBufferResult,
} from "./types";

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
}

export class CloudinaryStorageProvider implements StorageProvider {
  public readonly name = "cloudinary";
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(config?: CloudinaryConfig) {
    this.cloudName = config?.cloudName ?? env.CLOUDINARY_CLOUD_NAME ?? "";
    this.apiKey = config?.apiKey ?? env.CLOUDINARY_API_KEY ?? "";
    this.apiSecret = config?.apiSecret ?? env.CLOUDINARY_API_SECRET ?? "";

    if (this.cloudName && this.apiKey && this.apiSecret) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
    }
  }

  async createUploadSignature(
    options: CreateSignatureOptions
  ): Promise<SignedUploadPayload> {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
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

    // If public_id already includes a folder path (slashes), omit folder from signature and payload
    // so Cloudinary does not duplicate the folder name (e.g. folder/folder/id).
    const publicIdHasFolder = options.publicId.includes("/");
    const effectiveFolder = publicIdHasFolder ? "" : (options.folder ?? "");
    if (effectiveFolder) {
      paramsToSign.folder = effectiveFolder;
    }

    if (options.tags && options.tags.length > 0) {
      paramsToSign.tags = options.tags.join(",");
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.apiSecret
    );

    const uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`;

    return {
      publicId: options.publicId,
      folder: effectiveFolder,
      signature,
      timestamp,
      apiKey: this.apiKey,
      cloudName: this.cloudName,
      uploadUrl,
      resourceType,
      type,
      maxBytes: options.maxBytes,
      allowedFormats: options.allowedFormats,
    };
  }

  async uploadBuffer(
    buffer: Buffer,
    options: UploadBufferOptions
  ): Promise<UploadBufferResult> {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new Error("Cloudinary credentials are not configured");
    }

    const resourceType = options.resourceType ?? "image";
    const type = options.isPublic ? "upload" : "authenticated";
    const publicIdHasFolder = options.publicId.includes("/");
    const effectiveFolder = publicIdHasFolder ? undefined : options.folder;

    return new Promise<UploadBufferResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: options.publicId,
          folder: effectiveFolder,
          resource_type: resourceType,
          type,
          format: options.format,
          tags: options.tags,
        },
        (error, result) => {
          if (error || !result) {
            return reject(
              error || new Error("Cloudinary upload_stream returned no result")
            );
          }
          resolve({
            publicId: String(result.public_id ?? options.publicId),
            bytes: Number(result.bytes ?? buffer.byteLength),
            format: String(
              result.format ??
                options.format ??
                options.mime?.split("/")[1] ??
                "png"
            ),
            width: result.width ? Number(result.width) : undefined,
            height: result.height ? Number(result.height) : undefined,
            resourceType: String(result.resource_type ?? resourceType),
          });
        }
      );

      uploadStream.end(buffer);
    });
  }

  async head(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean; format?: string }
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
      const status =
        (err as { error?: { http_code?: number }; http_code?: number })
          ?.http_code ??
        (err as { error?: { http_code?: number } })?.error?.http_code;
      if (status === 404) {
        // Fallback: If raw file without extension in publicId, try with extension
        if (resourceType === "raw" && !publicId.includes(".") && options?.format) {
          try {
            const resWithExt = await cloudinary.api.resource(`${publicId}.${options.format}`, {
              resource_type: resourceType,
              type,
            });
            return {
              bytes: Number(resWithExt.bytes ?? 0),
              format: String(resWithExt.format ?? options.format),
              width: resWithExt.width ? Number(resWithExt.width) : undefined,
              height: resWithExt.height ? Number(resWithExt.height) : undefined,
              resourceType: String(resWithExt.resource_type ?? resourceType),
            };
          } catch {}
        }
        return null;
      }
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
