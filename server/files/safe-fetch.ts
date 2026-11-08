import "server-only";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { getSiteConfig } from "@/server/config/site";

export const BOT_NAME = "KlecxBot";

/** Crawler user agent; the info URL comes from site config (F0.2). */
export function getUserAgent(): string {
  return `${BOT_NAME}/1.0 (+${getSiteConfig().appUrl}/support)`;
}
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const DEFAULT_CONNECT_TIMEOUT_MS = 5_000; // 5 s
export const DEFAULT_TOTAL_TIMEOUT_MS = 10_000; // 10 s
export const DEFAULT_MAX_REDIRECTS = 3;
export const ALLOWED_MIME_TYPES = [
  "text/html",
  "text/plain",
  "application/pdf",
];

export class SsrfError extends Error {
  constructor(message: string, public readonly code: string = "SSRF_BLOCKED") {
    super(message);
    this.name = "SsrfError";
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  connectTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxBytes?: number;
  checkRobotsTxt?: boolean;
  allowedMimes?: string[];
  allowedPorts?: number[];
  allowLoopbackForTesting?: boolean;
  /** Optional custom DNS lookup function for testing / mocking */
  dnsLookup?: (hostname: string) => Promise<{ address: string; family: number }[]>;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  mime: string;
  buffer: Buffer;
  text?: string;
  title?: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  originalName: string;
}

/**
 * Checks whether an IP address (IPv4 or IPv6) is in a private, loopback,
 * link-local, carrier-grade NAT, multicast, metadata, or reserved range.
 * Returns true if the IP is blocked (unsafe).
 */
export function isPrivateOrBlockedIP(ipStr: string, allowLoopback = false): boolean {
  try {
    let addr = ipaddr.parse(ipStr);
    if (addr.kind() === "ipv6") {
      const v6 = addr as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        addr = v6.toIPv4Address();
      }
    }
    const range = addr.range();
    if (allowLoopback && range === "loopback") {
      return false;
    }
    // Only globally routable unicast is permitted
    if (range !== "unicast") {
      return true;
    }
    return false;
  } catch {
    return true; // Unparseable IP is untrusted
  }
}

/**
 * Validates protocol, port, and credentials of a user-supplied URL.
 */
export function validateUrl(rawUrl: string, allowedPorts: number[] = [80, 443], allowLoopback = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL format");
  }

  // 1) Scheme must be http or https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError(`Forbidden protocol: ${parsed.protocol}. Only http and https are allowed.`);
  }

  // No credentials in URL
  if (parsed.username || parsed.password) {
    throw new SsrfError("Credentials in URL are not allowed");
  }

  // Port check (default 80/443)
  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!allowedPorts.includes(portNum)) {
      throw new SsrfError(`Forbidden port: ${parsed.port}. Only ports ${allowedPorts.join(", ")} are allowed.`);
    }
  }

  // Check if hostname itself is directly a private/loopback IP (e.g. 127.0.0.1, [::1], 2130706433)
  const cleanHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(cleanHostname)) {
    if (isPrivateOrBlockedIP(cleanHostname, allowLoopback)) {
      throw new SsrfError(`Forbidden IP address: ${cleanHostname}`);
    }
  }

  return parsed;
}

/**
 * Resolves all DNS records for a hostname and verifies that NONE of them
 * resolve to private, loopback, link-local, metadata or reserved ranges.
 */
export async function resolveDnsAndValidate(
  hostname: string,
  customLookup?: (hostname: string) => Promise<{ address: string; family: number }[]>,
  allowLoopback = false
): Promise<{ address: string; family: number }[]> {
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");

  let records: { address: string; family: number }[];
  if (customLookup) {
    records = await customLookup(cleanHostname);
  } else {
    try {
      const res = await dns.lookup(cleanHostname, { all: true });
      records = Array.isArray(res) ? res : [res];
    } catch (err: unknown) {
      throw new SsrfError(
        `DNS resolution failed for hostname "${hostname}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (!records || records.length === 0) {
    throw new SsrfError(`DNS resolution returned no addresses for "${hostname}"`);
  }

  // Crucial: Reject if ANY address is private/loopback/link-local/CGNAT/multicast/metadata
  for (const rec of records) {
    if (isPrivateOrBlockedIP(rec.address, allowLoopback)) {
      throw new SsrfError(
        `Resolved IP ${rec.address} is forbidden (private, loopback, or metadata address)`
      );
    }
  }

  return records;
}

/**
 * Simple robots.txt evaluator for KlecxBot and generic crawlers (*).
 */
export function isPathDisallowedByRobotsTxt(
  robotsTxt: string,
  pathname: string,
  botName = BOT_NAME
): boolean {
  const lines = robotsTxt.split(/\r?\n/);
  let activeUserAgentMatches = false;
  const disallows: string[] = [];
  const allows: string[] = [];

  for (const raw of lines) {
    const line = (raw.trim().split("#")[0] ?? "").trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      const ua = val.toLowerCase();
      activeUserAgentMatches = ua === "*" || ua === botName.toLowerCase();
    } else if (activeUserAgentMatches) {
      if (key === "disallow" && val) {
        disallows.push(val);
      } else if (key === "allow" && val) {
        allows.push(val);
      }
    }
  }

  const matchingDisallow = disallows
    .filter((d) => pathname.startsWith(d))
    .sort((a, b) => b.length - a.length)[0];
  const matchingAllow = allows
    .filter((a) => pathname.startsWith(a))
    .sort((a, b) => b.length - a.length)[0];

  if (matchingDisallow) {
    if (matchingAllow && matchingAllow.length >= matchingDisallow.length) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Extracts clean readable text from HTML, PDF, or Plain Text.
 */
export async function extractReadableContent(
  buffer: Buffer,
  mime: string,
  url: string
): Promise<{
  text: string;
  title?: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
}> {
  const lowerMime = mime.toLowerCase();

  if (lowerMime.includes("html")) {
    const html = buffer.toString("utf8");
    try {
      const { document } = parseHTML(html);
      const reader = new Readability(document);
      const article = reader.parse();

      if (article && article.textContent) {
        return {
          text: article.textContent.trim().replace(/\n\s*\n\s*\n/g, "\n\n"),
          title: article.title || undefined,
          byline: article.byline || undefined,
          excerpt: article.excerpt || undefined,
          siteName: article.siteName || undefined,
        };
      }

      // Fallback if readability found no article
      const fallbackText = (document.body?.textContent || "")
        .trim()
        .replace(/\n\s*\n\s*\n/g, "\n\n");
      const title = document.querySelector("title")?.textContent || undefined;
      return { text: fallbackText, title };
    } catch {
      return { text: buffer.toString("utf8").trim() };
    }
  }

  if (lowerMime.includes("pdf")) {
    const { extractDocumentText } = await import("./extract");
    const res = await extractDocumentText(buffer, "application/pdf");
    return { text: res.text };
  }

  // Plain text fallback
  return { text: buffer.toString("utf8").trim() };
}

/**
 * The ONLY function allowed to fetch user-supplied URLs.
 * Fully protects against SSRF, DNS rebinding, slow-loris, and body bloat.
 */
export async function safeFetch(
  rawUrl: string,
  options?: SafeFetchOptions
): Promise<SafeFetchResult> {
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const connectTimeoutMs = options?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const totalTimeoutMs = options?.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedMimes = options?.allowedMimes ?? ALLOWED_MIME_TYPES;
  const allowedPorts = options?.allowedPorts ?? [80, 443];
  const allowLoopback = options?.allowLoopbackForTesting ?? false;
  const checkRobots = options?.checkRobotsTxt ?? false;
  const dnsLookup = options?.dnsLookup;

  let currentUrl = rawUrl;
  let redirectCount = 0;

  while (true) {
    // 1) Scheme must be http/https; port 80/443 only; no credentials
    const parsedUrl = validateUrl(currentUrl, allowedPorts, allowLoopback);

    // 2) Resolve DNS ourselves; reject if ANY address is private/loopback/link-local/metadata
    const resolvedAddresses = await resolveDnsAndValidate(parsedUrl.hostname, dnsLookup, allowLoopback);
    const validatedIp = resolvedAddresses[0];
    if (!validatedIp) {
      throw new SsrfError(`Unable to resolve IP address for ${parsedUrl.hostname}`);
    }

    // Optional robots.txt check (only on initial fetch or when requested)
    if (checkRobots && redirectCount === 0) {
      try {
        const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;
        const robotsResult = await safeFetch(robotsUrl, {
          ...options,
          checkRobotsTxt: false,
          maxBytes: 64 * 1024,
          totalTimeoutMs: 3_000,
          allowedMimes: ["text/plain", "text/html"],
        });
        if (robotsResult.status === 200 && robotsResult.text) {
          const disallowed = isPathDisallowedByRobotsTxt(
            robotsResult.text,
            parsedUrl.pathname || "/"
          );
          if (disallowed) {
            throw new SsrfError("URL is disallowed by robots.txt");
          }
        }
      } catch (err: unknown) {
        if (err instanceof SsrfError && err.message.includes("robots.txt")) {
          throw err;
        }
        // If robots.txt returns 404 or fails, crawler is permitted
      }
    }

    // 3) Connect to the VALIDATED IP using custom undici Agent lookup
    const agent = new Agent({
      connect: {
        timeout: connectTimeoutMs,
        lookup: (_h, opts, cb) => {
          if (opts && opts.all) {
            cb(null, [{ address: validatedIp.address, family: validatedIp.family }]);
          } else {
            cb(null, validatedIp.address, validatedIp.family);
          }
        },
      },
    });

    const abortController = new AbortController();
    let timeoutHandle: NodeJS.Timeout | null = null;
    if (totalTimeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        abortController.abort(new Error(`Total fetch timeout of ${totalTimeoutMs}ms exceeded`));
      }, totalTimeoutMs);
    }

    let response;
    try {
      response = await request(parsedUrl.toString(), {
        dispatcher: agent,
        method: "GET",
        headers: {
          Host: parsedUrl.host,
          "User-Agent": getUserAgent(),
          Accept: "text/html, text/plain, application/pdf;q=0.9, */*;q=0.1",
        },
        signal: abortController.signal,
      });
    } catch (err: unknown) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (abortController.signal.aborted) {
        throw new SsrfError(`Request timed out after ${totalTimeoutMs}ms`);
      }
      throw new SsrfError(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4) Redirects: manual, max 3 hops, re-run steps 1-3 on every hop
    const status = response.statusCode;
    if (status >= 300 && status < 400) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new SsrfError(`Maximum redirect limit (${maxRedirects}) exceeded`);
      }

      const location = response.headers.location;
      if (!location || typeof location !== "string") {
        throw new SsrfError(`Redirect returned with no Location header`);
      }

      // Resolve redirect URL against current URL
      currentUrl = new URL(location, parsedUrl.toString()).toString();
      continue;
    }

    if (status < 200 || status >= 400) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      throw new SsrfError(`Target server returned HTTP ${status}`);
    }

    // Validate Content-Type
    const contentTypeHeader = (response.headers["content-type"] as string) || "application/octet-stream";
    const baseMime = (contentTypeHeader.split(";")[0] ?? "").trim().toLowerCase();

    const isMimeAllowed = allowedMimes.some((m) => baseMime === m || baseMime.startsWith(m));
    if (!isMimeAllowed) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      throw new SsrfError(`Unsupported content type: ${baseMime}`);
    }

    // 5) Max body 2 MB; accumulate chunks with hard stop
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    try {
      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buf.length;
        if (receivedBytes > maxBytes) {
          abortController.abort();
          throw new SsrfError(`Response body exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit`);
        }
        chunks.push(buf);
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    const fullBuffer = Buffer.concat(chunks);

    // Extract readable text
    const extracted = await extractReadableContent(fullBuffer, baseMime, parsedUrl.toString());

    return {
      url: parsedUrl.toString(),
      status,
      mime: baseMime,
      buffer: fullBuffer,
      text: extracted.text,
      title: extracted.title,
      byline: extracted.byline,
      excerpt: extracted.excerpt,
      siteName: extracted.siteName,
      originalName: parsedUrl.hostname,
    };
  }
}
