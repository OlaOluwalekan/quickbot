import "server-only";
import { UAParser } from "ua-parser-js";
import { db } from "@/server/db/client";
import { notify } from "@/server/services/notify";

/**
 * Mask IP address to coarse subnet:
 * IPv4: 203.0.113.x
 * IPv6: 2001:db8::x or mask last segment
 */
export function maskIp(ip?: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    }
    return `${trimmed}.x`;
  }
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length > 1) {
      parts[parts.length - 1] = "x";
      return parts.join(":");
    }
    return `${trimmed}:x`;
  }
  return trimmed;
}

/**
 * Parse user agent string with ua-parser-js into device, os, browser, and client type.
 */
export function parseDeviceMetadata(
  userAgent?: string | null,
  customDeviceName?: string | null,
  clientHeader?: string | null
): {
  browser: string;
  os: string;
  deviceLabel: string;
  client: "web" | "mobile";
} {
  const parser = new UAParser(userAgent || undefined);
  const result = parser.getResult();

  const browserName = result.browser.name || "Unknown Browser";
  const osName = result.os.name || "Unknown OS";
  const isMobileDevice =
    result.device.type === "mobile" || result.device.type === "tablet";
  const client: "web" | "mobile" =
    clientHeader === "mobile" || isMobileDevice ? "mobile" : "web";

  let deviceLabel = customDeviceName?.trim();
  if (!deviceLabel) {
    if (isMobileDevice && result.device.vendor && result.device.model) {
      deviceLabel = `${result.device.vendor} ${result.device.model} (${browserName})`;
    } else {
      deviceLabel = `${browserName} on ${osName}`;
    }
  }

  return {
    browser: browserName,
    os: osName,
    deviceLabel,
    client,
  };
}

/**
 * Check if a newly created session is from a new (browser, os, country) combo
 * and send an alert email if so.
 */
export async function checkAndAlertNewSignIn(newSession: {
  id: string;
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  country?: string | null;
  deviceLabel?: string | null;
}): Promise<void> {
  try {
    const previousSessions = await db.session.findMany({
      where: {
        userId: newSession.userId,
        id: { not: newSession.id },
      },
      select: {
        userAgent: true,
        country: true,
      },
    });

    // If this is the user's very first session, no alert needed
    if (previousSessions.length === 0) {
      return;
    }

    const newParsed = parseDeviceMetadata(newSession.userAgent);
    const newBrowser = newParsed.browser.toLowerCase();
    const newOs = newParsed.os.toLowerCase();
    const newCountry = (newSession.country || "").toLowerCase();

    const matchesExisting = previousSessions.some((prev) => {
      const prevParsed = parseDeviceMetadata(prev.userAgent);
      const prevBrowser = prevParsed.browser.toLowerCase();
      const prevOs = prevParsed.os.toLowerCase();
      const prevCountry = (prev.country || "").toLowerCase();

      return (
        prevBrowser === newBrowser &&
        prevOs === newOs &&
        prevCountry === newCountry
      );
    });

    if (!matchesExisting) {
      // In-app and email delivery both follow the user's NEW_SIGN_IN preferences
      await notify(
        newSession.userId,
        "NEW_SIGN_IN",
        {
          sessionId: newSession.id,
          time: new Date().toUTCString(),
          device: newSession.deviceLabel || newParsed.deviceLabel,
          ipAddress: maskIp(newSession.ipAddress) || undefined,
          location: newSession.country || undefined,
          href: "/settings/sessions",
        },
        { dedupeKey: `new_sign_in:${newSession.id}` }
      );
    }
  } catch (err) {
    // Non-blocking: log but don't fail session creation
    console.error("[Session] Error checking new sign-in alert:", err);
  }
}
