import "server-only";
import sharp, { type OutputInfo } from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { getStorageProvider } from "@/server/storage/provider";
import {
  MAX_SUPPORT_SCREENSHOTS,
  MAX_SUPPORT_SCREENSHOT_BYTES,
  MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES,
  MAX_SUPPORT_SCREENSHOT_DIMENSION,
  SUPPORT_SCREENSHOT_LINK_TTL_SECONDS,
  isSupportScreenshotMime,
  type SupportScreenshotMime,
} from "@/lib/support/screenshots";

/** A file as received from the form. */
export interface IncomingScreenshot {
  buffer: Buffer;
}

/** A screenshot that passed every check, re-encoded without metadata. */
export interface CleanScreenshot {
  buffer: Buffer;
  mime: SupportScreenshotMime;
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
}

const FORMAT_BY_MIME: Record<SupportScreenshotMime, CleanScreenshot["format"]> =
  {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
  };

/**
 * Checks count and sizes, the real file type (magic bytes, not the name or the
 * browser's MIME) and the pixel dimensions, then re-encodes each image so
 * EXIF, GPS and other metadata are dropped. Throws a 422 with a stable code
 * (`Errors.api.<code>`) on the first problem; `details.index` names the file.
 */
export async function prepareSupportScreenshots(
  files: IncomingScreenshot[]
): Promise<CleanScreenshot[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_SUPPORT_SCREENSHOTS) {
    throw Errors.unprocessable(
      `At most ${MAX_SUPPORT_SCREENSHOTS} screenshots`,
      "too_many_screenshots",
      { max: MAX_SUPPORT_SCREENSHOTS }
    );
  }

  let total = 0;
  files.forEach((file, index) => {
    if (
      file.buffer.byteLength === 0 ||
      file.buffer.byteLength > MAX_SUPPORT_SCREENSHOT_BYTES
    ) {
      throw Errors.unprocessable(
        "Screenshot too large or empty",
        "screenshot_too_large",
        {
          index,
          maxBytes: MAX_SUPPORT_SCREENSHOT_BYTES,
        }
      );
    }
    total += file.buffer.byteLength;
  });
  if (total > MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES) {
    throw Errors.unprocessable(
      "Screenshots too large together",
      "screenshots_too_large",
      {
        maxBytes: MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES,
      }
    );
  }

  const cleaned: CleanScreenshot[] = [];
  for (const [index, file] of files.entries()) {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !isSupportScreenshotMime(detected.mime)) {
      throw Errors.unprocessable(
        "Unsupported screenshot type",
        "screenshot_type_unsupported",
        {
          index,
        }
      );
    }
    const mime = detected.mime;

    let width: number | undefined;
    let height: number | undefined;
    try {
      // Reads the header only, so an oversized image is refused before decoding.
      const meta = await sharp(file.buffer).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      throw Errors.unprocessable(
        "Unreadable screenshot",
        "screenshot_unreadable",
        { index }
      );
    }
    if (!width || !height) {
      throw Errors.unprocessable(
        "Unreadable screenshot",
        "screenshot_unreadable",
        { index }
      );
    }
    if (
      width > MAX_SUPPORT_SCREENSHOT_DIMENSION ||
      height > MAX_SUPPORT_SCREENSHOT_DIMENSION
    ) {
      throw Errors.unprocessable(
        "Screenshot dimensions too large",
        "screenshot_dimensions_too_large",
        { index, maxDimension: MAX_SUPPORT_SCREENSHOT_DIMENSION }
      );
    }

    const format = FORMAT_BY_MIME[mime];
    let output: { data: Buffer; info: OutputInfo };
    try {
      // sharp writes no metadata unless asked (no EXIF, GPS, XMP or ICC);
      // rotate() first applies the EXIF orientation so the image still looks right.
      const pipeline = sharp(file.buffer, {
        limitInputPixels:
          MAX_SUPPORT_SCREENSHOT_DIMENSION * MAX_SUPPORT_SCREENSHOT_DIMENSION,
      }).rotate();
      const encoded =
        format === "png"
          ? pipeline.png({ compressionLevel: 9 })
          : format === "jpeg"
            ? pipeline.jpeg({ quality: 90 })
            : pipeline.webp({ quality: 90 });
      output = await encoded.toBuffer({ resolveWithObject: true });
    } catch {
      throw Errors.unprocessable(
        "Unreadable screenshot",
        "screenshot_unreadable",
        { index }
      );
    }

    cleaned.push({
      buffer: output.data,
      mime,
      format,
      width: output.info.width,
      height: output.info.height,
    });
  }
  return cleaned;
}

/**
 * Uploads cleaned screenshots to the private folder `support/<ticketId>/` and
 * records them. On a storage failure, removes what was uploaded and rethrows.
 */
export async function storeSupportScreenshots(
  ticketId: string,
  screenshots: CleanScreenshot[]
): Promise<{ id: string; providerId: string; format: string }[]> {
  if (screenshots.length === 0) return [];
  const storage = getStorageProvider();
  const uploaded: {
    providerId: string;
    format: string;
    shot: CleanScreenshot;
  }[] = [];
  const removeUploaded = () =>
    Promise.all(
      uploaded.map((u) =>
        storage
          .delete(u.providerId, { resourceType: "image" })
          .catch(() => false)
      )
    );

  try {
    for (const shot of screenshots) {
      const result = await storage.uploadBuffer(shot.buffer, {
        publicId: crypto.randomUUID(),
        folder: `support/${ticketId}`,
        resourceType: "image",
        format: shot.format,
        mime: shot.mime,
        isPublic: false,
        tags: ["support"],
      });
      uploaded.push({ providerId: result.publicId, format: shot.format, shot });
    }
  } catch (err) {
    await removeUploaded();
    throw err;
  }

  try {
    const rows = await db.$transaction(
      uploaded.map((u) =>
        db.supportAttachment.create({
          data: {
            ticketId,
            providerId: u.providerId,
            mime: u.shot.mime,
            bytes: u.shot.buffer.byteLength,
            width: u.shot.width,
            height: u.shot.height,
          },
          select: { id: true, providerId: true },
        })
      )
    );
    return rows.map((row, i) => ({ ...row, format: uploaded[i]!.format }));
  } catch (err) {
    await removeUploaded();
    throw err;
  }
}

/** Signed links that expire after 7 days, for the support team's email. */
export async function supportScreenshotLinks(
  attachments: { providerId: string; format: string }[]
): Promise<string[]> {
  const storage = getStorageProvider();
  return Promise.all(
    attachments.map((a) =>
      storage.privateUrl(a.providerId, {
        resourceType: "image",
        format: a.format,
        expiresInSeconds: SUPPORT_SCREENSHOT_LINK_TTL_SECONDS,
      })
    )
  );
}
