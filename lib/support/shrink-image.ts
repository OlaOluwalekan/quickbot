/**
 * Browser-only: re-encodes a large screenshot as WebP (longest side at most
 * 2560 px) so several screenshots fit in one request (see
 * MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES). Returns the original file when it is
 * already small, when the browser can't re-encode, or when the result isn't smaller.
 * Re-encoding through a canvas also drops EXIF/GPS metadata; the server strips it again anyway.
 */
export const SHRINK_THRESHOLD_BYTES = 600 * 1024;
const MAX_SIDE = 2560;

export async function shrinkScreenshot(file: File): Promise<File> {
  if (file.size <= SHRINK_THRESHOLD_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85)
    );
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}
