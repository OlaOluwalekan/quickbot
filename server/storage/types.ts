export type StorageResourceType = "image" | "raw" | "video" | "auto";

export type AttachmentKind =
  | "IMAGE"
  | "DOCUMENT"
  | "GENERATED_IMAGE"
  | "GENERATED_DOCUMENT"
  | "AVATAR"
  | "AUDIO";

export interface SignedUploadPayload {
  publicId: string;
  folder: string;
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  uploadUrl: string;
  resourceType: StorageResourceType;
  type: "authenticated" | "upload";
  maxBytes?: number;
  allowedFormats?: string[];
}

export interface StorageAssetMeta {
  bytes: number;
  format: string;
  width?: number;
  height?: number;
  resourceType: string;
}

export interface CreateSignatureOptions {
  publicId: string;
  folder?: string;
  maxBytes?: number;
  allowedFormats?: string[];
  resourceType?: StorageResourceType;
  tags?: string[];
  isPublic?: boolean;
}

export interface StorageProvider {
  name: string;
  createUploadSignature(options: CreateSignatureOptions): Promise<SignedUploadPayload>;
  head(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<StorageAssetMeta | null>;
  delete(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<boolean>;
  privateUrl(
    publicId: string,
    options?: {
      resourceType?: StorageResourceType;
      expiresInSeconds?: number;
      format?: string;
    }
  ): Promise<string>;
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
  ): string;
  downloadBuffer(
    publicId: string,
    options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<Buffer>;
}
