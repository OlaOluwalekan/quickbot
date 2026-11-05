import crypto from "node:crypto";

export const RESERVED_USERNAMES = new Set([
  "admin",
  "root",
  "support",
  "help",
  "api",
  "klecx",
  "billing",
  "security",
  "staff",
  "system",
  "null",
  "undefined",
  "www",
  "mail",
  "app",
  "settings",
  "login",
  "register",
  "share",
  "s",
  "me",
  "user",
  "users",
  "account",
  "profile",
  "auth",
  "dashboard",
  "workspace",
  "workspaces",
  "project",
  "projects",
  "terms",
  "privacy",
  "status",
  "docs",
  "pricing",
  "bot",
  "quickbot",
  "superuser",
]);

// Basic profane / blocked substrings or terms
const BLOCKED_TERMS = new Set([
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "pussy",
  "nigger",
  "faggot",
  "whore",
  "slut",
  "bastard",
]);

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function generateDefaultUsername(): string {
  // `user_` + 8 random base-36 chars
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.randomBytes(8);
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    const byte = bytes[i] ?? 0;
    suffix += chars[byte % chars.length] ?? "0";
  }
  return `user_${suffix}`;
}

export type UsernameValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; reason: string };

export function validateUsernameFormat(raw: string): UsernameValidationResult {
  const normalized = normalizeUsername(raw);

  if (normalized.length < 3) {
    return { valid: false, reason: "Username must be at least 3 characters long." };
  }
  if (normalized.length > 30) {
    return { valid: false, reason: "Username cannot exceed 30 characters." };
  }
  if (!/^[a-z]/.test(normalized)) {
    return { valid: false, reason: "Username must start with a letter." };
  }
  if (normalized.includes("__")) {
    return { valid: false, reason: "Username cannot contain consecutive underscores." };
  }
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(normalized)) {
    return { valid: false, reason: "Username can only contain lowercase letters, numbers, and underscores." };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { valid: false, reason: "This username is reserved." };
  }
  for (const term of BLOCKED_TERMS) {
    if (normalized.includes(term)) {
      return { valid: false, reason: "This username is not permitted." };
    }
  }

  return { valid: true, normalized };
}
