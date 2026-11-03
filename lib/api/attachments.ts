import { api } from "./client";

export interface AttachmentUploadMeta {
  bytes: number;
  format: string;
}

export interface AttachmentInitResponse {
  attachment?: { id: string };
  attachmentId?: string;
  uploadPayload?: {
    publicId: string;
    folder?: string;
    signature: string;
    timestamp: number;
    apiKey: string;
    cloudName: string;
    uploadUrl: string;
    resourceType: string;
    type?: string;
  };
}

/**
 * Infers an appropriate MIME type from filename when browser's file.type
 * is missing or generic application/octet-stream.
 */
export function inferMimeType(fileName: string, mimeType?: string): string {
  const normalized = mimeType?.toLowerCase().trim();
  if (
    normalized &&
    normalized !== "application/octet-stream" &&
    normalized !== ""
  ) {
    if (normalized === "image/jpg") return "image/jpeg";
    if (normalized === "text/x-markdown") return "text/markdown";
    if (normalized === "text/x-csv" || normalized === "application/csv")
      return "text/csv";
    return normalized;
  }

  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return normalized || "application/octet-stream";
  }
}

/**
 * Uploads a file directly to the configured storage provider (Cloudinary/Mock)
 * using client-side direct signed upload and marks the attachment ready.
 */
export async function uploadAttachment(
  file: File,
  workspaceId: string,
  onProgress?: (progressPct: number) => void
): Promise<string> {
  const mime = inferMimeType(file.name, file.type);
  const kind = mime.startsWith("image/") ? "IMAGE" : "DOCUMENT";

  // 1. Initialize attachment upload on Klecx API
  const initRes = await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/attachments/init`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        filename: file.name,
        mime,
        bytes: file.size,
        kind,
      }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to initialize upload");
  }

  const initData: AttachmentInitResponse = await initRes.json();
  const attachmentId = initData.attachmentId || initData.attachment?.id;
  const uploadPayload = initData.uploadPayload;

  if (!attachmentId) {
    throw new Error("Invalid attachment init response: missing attachment ID");
  }

  let mockBase64: string | undefined;
  let actualProviderId = uploadPayload?.publicId || attachmentId;

  // 2. Direct upload if uploadPayload is present
  if (uploadPayload) {
    if (uploadPayload.uploadUrl.includes("mock.storage.local")) {
      // Mock storage provider: read file as base64 for server-side verification in dev/test
      mockBase64 = await new Promise<string>((resolve) => {
        if (typeof FileReader !== "undefined") {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const b64 = dataUrl.split(",")[1] || "";
            resolve(b64);
          };
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        } else {
          resolve("");
        }
      });
      onProgress?.(100);
    } else {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadPayload.uploadUrl);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resData = JSON.parse(xhr.responseText);
              if (resData?.public_id) {
                actualProviderId = resData.public_id;
              }
            } catch {}
            onProgress?.(100);
            resolve();
          } else {
            let errorMsg = `Storage upload failed with status ${xhr.status}`;
            try {
              const errObj = JSON.parse(xhr.responseText);
              if (errObj?.error?.message) {
                errorMsg = errObj.error.message;
              }
            } catch {}
            console.error("[Attachment Upload Error]:", errorMsg, xhr.responseText);
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during file upload"));

        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", uploadPayload.apiKey);
        formData.append("timestamp", String(uploadPayload.timestamp));
        formData.append("signature", uploadPayload.signature);
        formData.append("public_id", uploadPayload.publicId);
        if (uploadPayload.type) {
          formData.append("type", uploadPayload.type);
        }
        if (uploadPayload.folder) {
          formData.append("folder", uploadPayload.folder);
        }

        xhr.send(formData);
      });
    }
  }

  // 3. Complete attachment
  const ext = file.name.split(".").pop() || "";
  const completeRes = await fetch(
    `/api/v1/attachments/${encodeURIComponent(attachmentId)}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: actualProviderId,
        mockBase64,
        meta: {
          bytes: file.size,
          format: ext,
        },
      }),
    }
  );

  if (!completeRes.ok) {
    const err = await completeRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || "Failed to finalize attachment");
  }

  return attachmentId;
}
