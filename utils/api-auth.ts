import type { NextRequest } from "next/server";
import crypto from "crypto";
import { env } from "@/server/env";

import { getUserById } from "./actions/user";

const SECRET = env.AUTH_SECRET;

export interface MobileTokenPayload {
  sub: string;
  email?: string | null;
  role?: string;
  iat: number;
  exp: number;
}

/**
 * Signs a lightweight JWT token using HMAC-SHA256 for mobile/external API clients.
 */
export function signMobileToken(
  user: { id: string; email?: string | null; role?: string },
  expiresInSeconds = 60 * 60 * 24 * 30 // 30 days
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const payload: MobileTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );

  const signature = crypto
    .createHmac("sha256", SECRET as string)
    .update(`${header}.${encodedPayload}`)
    .digest("base64url");

  return `${header}.${encodedPayload}.${signature}`;
}

/**
 * Verifies a Bearer JWT token signed by `signMobileToken`.
 */
export function verifyMobileToken(token: string): MobileTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, encodedPayload, signature] = parts;
    if (!header || !encodedPayload || !signature) return null;

    // Reject tokens whose header alg isn't HS256
    const headerObj = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8")
    );
    if (headerObj.alg !== "HS256") {
      return null;
    }

    const expectedSig = crypto
      .createHmac("sha256", SECRET as string)
      .update(`${header}.${encodedPayload}`)
      .digest("base64url");

    const expectedBuf = Buffer.from(expectedSig);
    const sigBuf = Buffer.from(signature);
    if (
      expectedBuf.length !== sigBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, sigBuf)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as MobileTokenPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated user from either:
 * 1. NextAuth session cookie (web app)
 * 2. Authorization: Bearer <token> header (mobile app / external REST client)
 */
export async function getAuthenticatedUser(req?: NextRequest | Request) {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    if (session?.user?.id) {
      const dbUser = await getUserById(session.user.id);
      if (dbUser) {
        return dbUser;
      }
    }
  } catch {
    // Ignore session check failure and fallback to Authorization header
  }

  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const payload = verifyMobileToken(token);
      if (payload?.sub) {
        const dbUser = await getUserById(payload.sub);
        if (dbUser) {
          return dbUser;
        }
      }
    }
  }

  return null;
}
