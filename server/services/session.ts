import "server-only";
import { db } from "@/server/db/client";
import { auth } from "@/server/auth/auth";
import { verifyPassword } from "better-auth/crypto";
import { Errors } from "@/server/http/errors";
import { limit } from "@/server/http/rate-limit";
import type { Actor } from "@/server/auth/session";
import {
  parseDeviceMetadata,
  maskIp,
} from "./device";

export * from "./device";

export interface FormattedSession {
  id: string;
  current: boolean;
  deviceLabel: string;
  os: string;
  browser: string;
  country: string | null;
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  client: "web" | "mobile";
}

/**
 * List all active sessions for a user, sorted by last active descending.
 */
export async function listUserSessions(
  userId: string,
  currentSessionId: string
): Promise<FormattedSession[]> {
  const sessions = await db.session.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: "desc" },
  });

  return sessions.map((s) => {
    const parsed = parseDeviceMetadata(
      s.userAgent,
      s.deviceLabel,
      s.client
    );
    return {
      id: s.id,
      current: s.id === currentSessionId,
      deviceLabel: s.deviceLabel || parsed.deviceLabel,
      os: parsed.os,
      browser: parsed.browser,
      country: s.country,
      ip: maskIp(s.ipAddress),
      createdAt: s.createdAt,
      lastActiveAt: s.updatedAt,
      expiresAt: s.expiresAt,
      client: (s.client === "mobile" ? "mobile" : parsed.client) as
        | "web"
        | "mobile",
    };
  });
}

/**
 * Check if the session was created recently (within 15 minutes).
 */
export function isRecentAuth(
  createdAt: Date | string | number,
  maxAgeMs = 15 * 60 * 1000
): boolean {
  const createdTime = new Date(createdAt).getTime();
  return Date.now() - createdTime <= maxAgeMs;
}

/**
 * Verify re-authentication requirement for sensitive actions.
 * If session is not fresh (< 15 min), password is required.
 */
export async function verifySensitiveActionAuth(
  actor: Actor,
  password?: string
): Promise<void> {
  const currentSession = await db.session.findUnique({
    where: { id: actor.sessionId },
  });

  if (!currentSession) {
    throw Errors.unauthorized();
  }

  if (isRecentAuth(currentSession.createdAt)) {
    return; // Fresh session, allowed
  }

  // Not fresh: require password re-entry
  if (!password) {
    throw Errors.forbidden(
      "This sensitive action requires authentication within the last 15 minutes or password re-entry.",
      "FRESH_LOGIN_REQUIRED"
    );
  }

  const credentialAccount = await db.account.findFirst({
    where: {
      userId: actor.userId,
      providerId: "credential",
    },
  });

  if (!credentialAccount || !credentialAccount.password) {
    throw Errors.forbidden(
      "This account does not have a password configured. Please sign out and sign in again.",
      "FRESH_LOGIN_REQUIRED"
    );
  }

  // Throttle password guesses per user (429 once exceeded).
  await limit("auth:reauth", actor.userId);

  const isValid = await verifyPassword({
    hash: credentialAccount.password,
    password,
  });

  if (!isValid) {
    // 403, not 401: a 401 makes route() clear the caller's auth cookies,
    // which would sign the user out for mistyping their password.
    throw Errors.forbidden("Incorrect password", "INVALID_PASSWORD");
  }
}

/**
 * Deletes sessions through Better Auth's internal adapter so they are removed
 * from secondary storage (Redis / in-memory) as well as the database. A
 * DB-only delete would leave the cached copy valid until it expires.
 */
async function deleteSessionsByToken(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { internalAdapter } = await auth.$context;
  for (const token of tokens) {
    await internalAdapter.deleteSession(token);
  }
}

/**
 * Revoke a single session by id.
 * Rules:
 * - Cannot revoke the current session (caller must use sign-out).
 * - Can only revoke own sessions.
 */
export async function revokeUserSession(
  actor: Actor,
  sessionId: string
): Promise<{ success: boolean; revokedId: string }> {
  if (sessionId === actor.sessionId) {
    throw Errors.badRequest(
      "Cannot revoke current session using this endpoint. Use sign out instead."
    );
  }

  const targetSession = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, token: true },
  });

  if (!targetSession || targetSession.userId !== actor.userId) {
    throw Errors.notFound("Session not found");
  }

  await deleteSessionsByToken([targetSession.token]);

  return { success: true, revokedId: sessionId };
}

/**
 * Revoke all other sessions for the user (except current).
 * Sensitive action: requires fresh login (< 15 min) or password.
 */
export async function revokeOtherUserSessions(
  actor: Actor,
  password?: string
): Promise<{ success: boolean; revokedCount: number }> {
  await verifySensitiveActionAuth(actor, password);

  const others = await db.session.findMany({
    where: { userId: actor.userId, id: { not: actor.sessionId } },
    select: { token: true },
  });

  await deleteSessionsByToken(others.map((s) => s.token));

  return { success: true, revokedCount: others.length };
}

/**
 * Revoke all sessions for the user (including current).
 * Sensitive action: requires fresh login (< 15 min) or password.
 */
export async function revokeAllUserSessions(
  actor: Actor,
  password?: string
): Promise<{ success: boolean; revokedCount: number }> {
  await verifySensitiveActionAuth(actor, password);

  const sessions = await db.session.findMany({
    where: { userId: actor.userId },
    select: { token: true },
  });

  await deleteSessionsByToken(sessions.map((s) => s.token));

  return { success: true, revokedCount: sessions.length };
}
