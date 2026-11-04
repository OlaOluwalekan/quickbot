import "server-only";
import {
  CreateSignatureOptions,
  SignedUploadPayload,
  StorageAssetMeta,
  StorageProvider,
  StorageResourceType,
  UploadBufferOptions,
  UploadBufferResult,
} from "./types";

interface StoredMockAsset {
  buffer: Buffer;
  meta: StorageAssetMeta;
  isPublic: boolean;
}

export class MockStorageProvider implements StorageProvider {
  public readonly name = "mock";
  private storage = new Map<string, StoredMockAsset>();

  seedFile(
    publicId: string,
    buffer: Buffer,
    meta?: Partial<StorageAssetMeta>,
    isPublic = false
  ): void {
    const bytes = meta?.bytes ?? buffer.byteLength;
    const format = meta?.format ?? "bin";
    const resourceType = meta?.resourceType ?? "raw";
    this.storage.set(publicId, {
      buffer,
      meta: {
        bytes,
        format,
        width: meta?.width,
        height: meta?.height,
        resourceType,
      },
      isPublic,
    });
  }

  clear(): void {
    this.storage.clear();
  }

  hasFile(publicId: string): boolean {
    return this.storage.has(publicId);
  }

  async createUploadSignature(
    options: CreateSignatureOptions
  ): Promise<SignedUploadPayload> {
    const timestamp = Math.floor(Date.now() / 1000);
    const resourceType = options.resourceType ?? "image";
    const isPublic = Boolean(options.isPublic);

    return {
      publicId: options.publicId,
      folder: options.folder ?? "",
      signature: `mock_sig_${timestamp}_${options.publicId}`,
      timestamp,
      apiKey: "mock_api_key",
      cloudName: "mock_cloud",
      uploadUrl: `https://mock.storage.local/v1_1/mock_cloud/${resourceType}/upload`,
      resourceType,
      type: isPublic ? "upload" : "authenticated",
      maxBytes: options.maxBytes,
      allowedFormats: options.allowedFormats,
    };
  }

  async uploadBuffer(
    buffer: Buffer,
    options: UploadBufferOptions
  ): Promise<UploadBufferResult> {
    const resourceType = options.resourceType ?? "image";
    const format =
      options.format ?? (options.mime?.split("/")[1] || "png");
    const isPublic = Boolean(options.isPublic);
    const fullPublicId =
      options.folder && !options.publicId.includes("/")
        ? `${options.folder}/${options.publicId}`
        : options.publicId;

    const meta: StorageAssetMeta = {
      bytes: buffer.byteLength,
      format,
      width: resourceType === "image" ? 1024 : undefined,
      height: resourceType === "image" ? 1024 : undefined,
      resourceType,
    };

    this.storage.set(fullPublicId, {
      buffer,
      meta,
      isPublic,
    });
    if (fullPublicId !== options.publicId) {
      this.storage.set(options.publicId, {
        buffer,
        meta,
        isPublic,
      });
    }

    return {
      publicId: fullPublicId,
      bytes: meta.bytes,
      format: meta.format,
      width: meta.width,
      height: meta.height,
      resourceType: meta.resourceType,
    };
  }

  async head(
    publicId: string,
    _options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<StorageAssetMeta | null> {
    const item = this.storage.get(publicId);
    if (!item) return null;
    return item.meta;
  }

  async delete(
    publicId: string,
    _options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<boolean> {
    return this.storage.delete(publicId);
  }

  async privateUrl(
    publicId: string,
    options?: {
      resourceType?: StorageResourceType;
      expiresInSeconds?: number;
      format?: string;
    }
  ): Promise<string> {
    const item = this.storage.get(publicId);
    const expiresAt =
      Math.floor(Date.now() / 1000) + (options?.expiresInSeconds ?? 300);
    const fmt = options?.format || item?.meta.format || "bin";
    return `https://mock.storage.local/private/${publicId}.${fmt}?expires=${expiresAt}&sig=mock_expiring_sig`;
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
    const w = options?.width ? `w_${options.width},` : "";
    const h = options?.height ? `h_${options.height},` : "";
    const c = options?.crop ? `c_${options.crop},` : "";
    const q = options?.quality ? `q_${options.quality},` : "q_auto,";
    const f = options?.format ? `f_${options.format}` : "f_auto";
    const transform = `${w}${h}${c}${q}${f}`;
    return `https://mock.storage.local/public/${transform}/${publicId}`;
  }

  async downloadBuffer(
    publicId: string,
    _options?: { resourceType?: StorageResourceType; isPublic?: boolean }
  ): Promise<Buffer> {
    const item = this.storage.get(publicId);
    if (!item) {
      throw new Error(`Asset not found in mock storage: ${publicId}`);
    }
    return item.buffer;
  }
}
