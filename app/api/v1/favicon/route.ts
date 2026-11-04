import { NextResponse } from "next/server";
import { safeFetch } from "@/server/files/safe-fetch";

interface CachedFavicon {
  buffer: Buffer;
  mime: string;
  expiresAt: number;
}

const FAVICON_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 500;
const faviconCache = new Map<string, CachedFavicon>();

const FALLBACK_GLOBE_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
  "utf8"
);

function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  // Must look like a valid public hostname (no protocol, slashes, ports, or IP literals)
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host)) {
    return false;
  }
  return true;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawHost = (searchParams.get("host") || "").trim().toLowerCase();

  if (!isValidHost(rawHost)) {
    return new NextResponse(new Uint8Array(FALLBACK_GLOBE_SVG), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const now = Date.now();
  const cached = faviconCache.get(rawHost);
  if (cached && cached.expiresAt > now) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": cached.mime,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  try {
    const res = await safeFetch(`https://${rawHost}/favicon.ico`, {
      allowedMimes: [
        "image/x-icon",
        "image/vnd.microsoft.icon",
        "image/png",
        "image/svg+xml",
        "image/webp",
        "image/gif",
        "image/jpeg",
      ],
      maxBytes: 128 * 1024,
      connectTimeoutMs: 2500,
      totalTimeoutMs: 4000,
      checkRobotsTxt: false,
    });

    if (faviconCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = faviconCache.keys().next().value;
      if (oldestKey) faviconCache.delete(oldestKey);
    }

    faviconCache.set(rawHost, {
      buffer: res.buffer,
      mime: res.mime,
      expiresAt: now + FAVICON_CACHE_TTL_MS,
    });

    return new NextResponse(new Uint8Array(res.buffer), {
      status: 200,
      headers: {
        "Content-Type": res.mime,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    // Cache fallback briefly so repeated renders don't hammer unreachable hosts
    faviconCache.set(rawHost, {
      buffer: FALLBACK_GLOBE_SVG,
      mime: "image/svg+xml",
      expiresAt: now + 60 * 60 * 1000,
    });

    return new NextResponse(new Uint8Array(FALLBACK_GLOBE_SVG), {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
}
