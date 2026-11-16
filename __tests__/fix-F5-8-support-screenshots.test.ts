/**
 * @jest-environment node
 *
 * F5.8 — screenshots on support requests: limits, real file type, dimensions,
 * metadata stripped, private storage, signed links in the support email.
 */
import crypto from "node:crypto";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { setStorageProvider } from "@/server/storage/provider";
import { MockStorageProvider } from "@/server/storage/mock";
import { POST } from "@/app/api/v1/support/route";
import {
  MAX_SUPPORT_SCREENSHOT_BYTES,
  SUPPORT_SCREENSHOT_LINK_TTL_SECONDS,
} from "@/lib/support/screenshots";
import type { Actor } from "@/server/auth/session";

let mockActor: Actor | null = null;
jest.mock("../server/auth/session", () => ({
  getActor: jest.fn(async () => mockActor),
}));
jest.mock("../server/http/rate-limit", () => ({
  ...jest.requireActual("../server/http/rate-limit"),
  limit: jest.fn(async () => {}),
}));
const sendEmail = jest.fn(async () => ({ success: true }));
jest.mock("../server/email/send", () => ({
  ...jest.requireActual("../server/email/send"),
  sendEmail: (...args: unknown[]) => sendEmail(...(args as [])),
}));

const storage = new MockStorageProvider();
const createdTickets: string[] = [];

async function png(width = 64, height = 48): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .png()
    .toBuffer();
}

/** A JPEG carrying EXIF with GPS coordinates and a camera owner's name. */
async function jpegWithGps(): Promise<Buffer> {
  return sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Artist: "Private Person", Copyright: "Private Person" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 27/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "3/1 23/1 0/1" },
    })
    .toBuffer();
}

/** Noise compresses badly, so this PNG is about 3 MB. */
async function threeMbPng(): Promise<Buffer> {
  const w = 1024;
  const h = 1000;
  return sharp(crypto.randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

function multipart(
  files: { buffer: Buffer; name: string; type: string }[],
  fields: Record<string, string> = {}
): NextRequest {
  const form = new FormData();
  form.append("email", "someone@example.com");
  form.append("topic", "bug");
  form.append("message", "The export button does nothing, see the screenshots.");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) {
    form.append("screenshots", new Blob([new Uint8Array(f.buffer)], { type: f.type }), f.name);
  }
  return new NextRequest("http://localhost:3000/api/v1/support", { method: "POST", body: form });
}

async function call(req: NextRequest) {
  const res = await POST(req, { params: Promise.resolve({}) } as never);
  const json = await res.json();
  if (res.ok && json?.data?.ticketId) createdTickets.push(json.data.ticketId);
  return { status: res.status, json };
}

beforeEach(() => {
  mockActor = null;
  storage.clear();
  setStorageProvider(storage);
  sendEmail.mockClear();
});

afterAll(async () => {
  await db.supportTicket.deleteMany({ where: { id: { in: createdTickets } } });
  setStorageProvider(null);
  await db.$disconnect();
});

describe("F5.8 — support screenshots", () => {
  it("refuses 6 files with 422 too_many_screenshots and stores nothing", async () => {
    const shot = await png();
    const files = Array.from({ length: 6 }, (_, i) => ({ buffer: shot, name: `s${i}.png`, type: "image/png" }));
    const before = await db.supportTicket.count();
    const { status, json } = await call(multipart(files));
    expect(status).toBe(422);
    expect(json.error.code).toBe("too_many_screenshots");
    expect(await db.supportTicket.count()).toBe(before);
  });

  it("refuses a 3 MB file with 422 screenshot_too_large", async () => {
    const big = await threeMbPng();
    expect(big.byteLength).toBeGreaterThan(MAX_SUPPORT_SCREENSHOT_BYTES);
    const { status, json } = await call(multipart([{ buffer: big, name: "big.png", type: "image/png" }]));
    expect(status).toBe(422);
    expect(json.error.code).toBe("screenshot_too_large");
  });

  it("refuses screenshots that are too large together (Vercel's 4.5 MB request limit)", async () => {
    // Three files just under 2 MB each: fine one by one, over 4 MB together.
    const w = 800;
    const h = 800;
    const noise = await sharp(crypto.randomBytes(w * h * 3), { raw: { width: w, height: h, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(noise.byteLength).toBeLessThan(MAX_SUPPORT_SCREENSHOT_BYTES);
    const files = [0, 1, 2].map((i) => ({ buffer: noise, name: `n${i}.png`, type: "image/png" }));
    const { status, json } = await call(multipart(files));
    expect(status).toBe(422);
    expect(json.error.code).toBe("screenshots_too_large");
  });

  it("refuses an .exe renamed .png (magic bytes) with 422", async () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2048, 0x90)]);
    const { status, json } = await call(multipart([{ buffer: exe, name: "photo.png", type: "image/png" }]));
    expect(status).toBe(422);
    expect(json.error.code).toBe("screenshot_type_unsupported");
    expect(storage.hasFile("photo.png")).toBe(false);
  });

  it("refuses images wider than 4096 px", async () => {
    const wide = await png(5000, 10);
    const { status, json } = await call(multipart([{ buffer: wide, name: "wide.png", type: "image/png" }]));
    expect(status).toBe(422);
    expect(json.error.code).toBe("screenshot_dimensions_too_large");
  });

  it("accepts an anonymous request: stores the files privately, without metadata", async () => {
    const withGps = await jpegWithGps();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const { status, json } = await call(
      multipart([
        { buffer: await png(), name: "one.png", type: "image/png" },
        { buffer: withGps, name: "two.jpg", type: "image/jpeg" },
      ])
    );
    expect(status).toBe(200);
    expect(json.data.screenshotCount).toBe(2);
    const ticketId = json.data.ticketId as string;

    const rows = await db.supportAttachment.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.mime).sort()).toEqual(["image/jpeg", "image/png"]);
    for (const row of rows) {
      expect(row.providerId.startsWith(`support/${ticketId}/`)).toBe(true);
      // Private upload (authenticated), never public.
      const stored = (storage as unknown as { storage: Map<string, { isPublic: boolean }> }).storage.get(row.providerId);
      expect(stored?.isPublic).toBe(false);
      const meta = await sharp(await storage.downloadBuffer(row.providerId)).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
    }
    // The response never exposes storage keys or URLs.
    expect(JSON.stringify(json)).not.toMatch(/support\/|mock\.storage/);
  });

  it("emails the support team signed links that expire after 7 days, and tells the person how many were attached", async () => {
    const { json } = await call(multipart([{ buffer: await png(), name: "one.png", type: "image/png" }]));
    const calls = sendEmail.mock.calls as unknown as [string, string, Record<string, unknown>][];
    const staff = calls.find((c) => c[0] === "support-notification");
    const ack = calls.find((c) => c[0] === "support-ack");
    const links = staff?.[2].screenshotLinks as string[];
    expect(links).toHaveLength(1);
    const expires = Number(new URL(links[0]!).searchParams.get("expires"));
    const expected = Math.floor(Date.now() / 1000) + SUPPORT_SCREENSHOT_LINK_TTL_SECONDS;
    expect(Math.abs(expires - expected)).toBeLessThan(60);
    expect(links[0]).toContain(`support/${json.data.ticketId}/`);
    expect(ack?.[2].screenshotCount).toBe(1);
  });

  it("renders the links in the support email and the count in the person's email", async () => {
    const { renderEmail } = jest.requireActual("../server/email/send");
    const staff = await renderEmail("support-notification", "support@example.com", {
      ticketId: "01234567-aaaa", senderEmail: "a@example.com", topic: "bug", message: "Hi",
      screenshotLinks: ["https://files.example/a.png?expires=1&sig=x&y=1"],
    });
    expect(staff.html).toContain("https://files.example/a.png?expires=1&amp;sig=x&amp;y=1");
    expect(staff.text).toContain("links expire in 7 days");
    const ack = await renderEmail("support-ack", "a@example.com",
      { ticketId: "01234567-aaaa", topic: "bug", message: "Hi", screenshotCount: 3 }, { locale: "fr" });
    expect(ack.text).toContain("3 captures d'écran jointes");
  });

  it("still accepts JSON requests without screenshots", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/support", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@example.com", topic: "general", message: "Just a question about plans." }),
    });
    const { status, json } = await call(req);
    expect(status).toBe(200);
    expect(json.data.screenshotCount).toBe(0);
  });

  it("stores nothing when the honeypot is filled", async () => {
    const before = await db.supportAttachment.count();
    const { status } = await call(
      multipart([{ buffer: await png(), name: "one.png", type: "image/png" }], { website: "http://spam" })
    );
    expect(status).toBe(200);
    expect(await db.supportAttachment.count()).toBe(before);
  });
});
