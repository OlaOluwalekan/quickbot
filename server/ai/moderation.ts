import "server-only";
import crypto from "node:crypto";
import { Errors } from "@/server/http/errors";

export type ModerationCategory =
  | "csam_or_minors"
  | "non_consensual_sexual"
  | "face_manipulation"
  | "extreme_violence"
  | "self_harm"
  | "illegal_acts"
  | "attachment_not_allowed"
  | "abuse_lock"
  | "policy_violation";

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  category?: ModerationCategory;
}

export interface ModerationProvider {
  name: string;
  moderatePrompt(text: string): Promise<ModerationResult> | ModerationResult;
}

export interface ModerationAuditEntry {
  userId: string;
  promptHash: string;
  category: ModerationCategory;
  timestamp: string;
}

export const MAX_IMAGE_BLOCKS_PER_DAY = 3;

interface DenylistRule {
  category: ModerationCategory;
  reason: string;
  patterns: RegExp[];
}

const DENYLIST_RULES: DenylistRule[] = [
  {
    category: "csam_or_minors",
    reason: "Prompts involving minors in sexual or exploitative contexts are strictly prohibited.",
    patterns: [
      /\b(csam|child\s+porn|underage\s+(nude|naked|sex|explicit)|minor\s+(nude|naked|sex|explicit)|preteen\s+(nude|sex)|loli|shota)\b/i,
      /\b(nude|naked|explicit|erotic|sexual)\b.*\b(child|children|kid|kids|minor|minors|toddler|infant|teenager|under\s*18|schoolgirl|schoolboy)\b/i,
      /\b(child|children|kid|kids|minor|minors|toddler|infant|under\s*18)\b.*\b(nude|naked|explicit|erotic|sexual)\b/i,
    ],
  },
  {
    category: "face_manipulation",
    reason: "Face swapping, deepfakes, and manipulating faces of real people are prohibited.",
    patterns: [
      /\b(face\s*swap|swap\s+(the\s+|their\s+|his\s+|her\s+|my\s+)?face|replace\s+(the\s+|their\s+|his\s+|her\s+)?face|put\s+.*\s+face\s+on|deep\s*fake|deepfake|alter\s+(the\s+|their\s+|his\s+|her\s+)?face|morph\s+.*\s+face)\b/i,
    ],
  },
  {
    category: "non_consensual_sexual",
    reason: "Non-consensual sexual content, nudification, and explicit imagery are prohibited.",
    patterns: [
      /\b(nudify|undress\s+(her|him|them|this\s+person)|strip\s+(her|him|them)\s+naked|remove\s+(her|his|their)\s+clothes|revenge\s+porn|non-consensual\s+nude|nsfw\s+nude|nude\s+nsfw|explicit\s+nude|explicit\s+porn|explicit\s+pornography|hardcore\s+porn)\b/i,
    ],
  },
  {
    category: "self_harm",
    reason: "Content depicting or encouraging self-harm or suicide is prohibited.",
    patterns: [
      /\b(how\s+to\s+(commit\s+suicide|kill\s+myself|self[\s-]harm|cut\s+my\s+wrists)|suicide\s+instruction|depict\s+suicide|cutting\s+wrists\s+blood)\b/i,
    ],
  },
  {
    category: "extreme_violence",
    reason: "Extreme graphic violence, gore, and mutilation are prohibited.",
    patterns: [
      /\b(decapitat(e|ion)|dismember(ment|ing)|gruesome\s+torture|graphic\s+mutilation|snuff\s+film|mass\s+shooting\s+bloodbath)\b/i,
    ],
  },
  {
    category: "illegal_acts",
    reason: "Instructions or depictions facilitating severe illegal acts or weapons of mass destruction are prohibited.",
    patterns: [
      /\b(build\s+a\s+(pipe\s+)?bomb|synthesize\s+(sarin|ricin|VX\s+nerve|anthrax|fentanyl)|improvised\s+explosive\s+device\s+blueprint)\b/i,
    ],
  },
];

export class LocalDenylistModerationProvider implements ModerationProvider {
  public readonly name = "local-denylist";

  moderatePrompt(text: string): ModerationResult {
    const normalized = text.trim();
    if (!normalized) {
      return { allowed: true };
    }

    for (const rule of DENYLIST_RULES) {
      for (const regex of rule.patterns) {
        if (regex.test(normalized)) {
          return {
            allowed: false,
            reason: rule.reason,
            category: rule.category,
          };
        }
      }
    }

    return { allowed: true };
  }
}

const defaultModerationProvider = new LocalDenylistModerationProvider();
let customModerationProvider: ModerationProvider | null = null;

// Per-user daily abuse counter: key = `${userId}:${YYYY-MM-DD}`
const dailyAbuseCounts = new Map<string, number>();

// Privacy-preserving audit log: stores hash + category ONLY, never full prompt text
const moderationAuditLogs: ModerationAuditEntry[] = [];

function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function hashPrompt(text: string): string {
  return crypto
    .createHash("sha256")
    .update(text.trim().toLowerCase(), "utf8")
    .digest("hex");
}

export function setModerationProvider(provider: ModerationProvider | null): void {
  customModerationProvider = provider;
}

export function getModerationProvider(): ModerationProvider {
  return customModerationProvider ?? defaultModerationProvider;
}

export function getModerationBlockCount(userId: string, date = new Date()): number {
  const key = `${userId}:${getUtcDateKey(date)}`;
  return dailyAbuseCounts.get(key) ?? 0;
}

export function isImageGenerationLocked(userId: string, date = new Date()): boolean {
  return getModerationBlockCount(userId, date) >= MAX_IMAGE_BLOCKS_PER_DAY;
}

export function recordModerationBlock(
  userId: string,
  prompt: string,
  category: ModerationCategory = "policy_violation",
  date = new Date()
): { blockCount: number; locked: boolean; promptHash: string } {
  const promptHash = hashPrompt(prompt);
  const key = `${userId}:${getUtcDateKey(date)}`;
  const nextCount = (dailyAbuseCounts.get(key) ?? 0) + 1;
  dailyAbuseCounts.set(key, nextCount);

  const entry: ModerationAuditEntry = {
    userId,
    promptHash,
    category,
    timestamp: date.toISOString(),
  };
  moderationAuditLogs.push(entry);

  console.warn(
    JSON.stringify({
      event: "moderation.image_prompt_blocked",
      userId,
      promptHash,
      category,
      blockCount: nextCount,
      locked: nextCount >= MAX_IMAGE_BLOCKS_PER_DAY,
    })
  );

  return {
    blockCount: nextCount,
    locked: nextCount >= MAX_IMAGE_BLOCKS_PER_DAY,
    promptHash,
  };
}

export function getModerationAuditLogs(): ReadonlyArray<ModerationAuditEntry> {
  return moderationAuditLogs;
}

export function resetModerationStateForTesting(): void {
  customModerationProvider = null;
  dailyAbuseCounts.clear();
  moderationAuditLogs.length = 0;
}

/**
 * Enforces image generation safety & abuse controls BEFORE reserving credits:
 * 1. Checks if user is under a temporary daily image lock (>= 3 blocks today).
 * 2. Rejects combining file/image attachments with image generation (prevents face-manipulation/deepfakes on uploaded photos).
 * 3. Runs ModerationProvider.moderatePrompt(prompt); on block, logs hash + category (never full text),
 *    increments daily abuse score, and throws 422 `content_blocked`.
 */
export async function enforceImagePromptModeration(
  userId: string,
  prompt: string,
  options?: {
    hasAttachments?: boolean;
    provider?: ModerationProvider;
  }
): Promise<void> {
  // 1. Check existing temporary image lock (3 blocks/day => temporary image lock)
  if (isImageGenerationLocked(userId)) {
    throw Errors.contentBlocked(
      "Image generation is temporarily locked for today due to repeated content policy violations.",
      {
        locked: true,
        blockCount: getModerationBlockCount(userId),
        category: "abuse_lock",
      }
    );
  }

  // 2. Run prompt moderation first to catch explicit policy violations (including face manipulation)
  const provider = options?.provider ?? getModerationProvider();
  const result = await provider.moderatePrompt(prompt);

  if (!result.allowed) {
    const category = result.category ?? "policy_violation";
    const { blockCount, locked, promptHash } = recordModerationBlock(
      userId,
      prompt,
      category
    );
    throw Errors.contentBlocked(
      result.reason || "Prompt blocked by content safety policy.",
      {
        category,
        promptHash,
        blockCount,
        locked,
      }
    );
  }

  // 3. No face manipulation / no image + attachment inputs together at launch
  if (options?.hasAttachments) {
    // Check if the prompt also hints at altering/modifying a person or photo
    const isPersonAlteration =
      /\b(person|photo|portrait|selfie|face|headshot|make\s+(him|her|them|me)|turn\s+(him|her|them|me)|edit\s+this\s+person)\b/i.test(
        prompt
      );

    if (isPersonAlteration) {
      const { blockCount, locked, promptHash } = recordModerationBlock(
        userId,
        prompt,
        "face_manipulation"
      );
      throw Errors.contentBlocked(
        "Manipulating or altering photos of people is not permitted during image generation.",
        {
          category: "face_manipulation",
          promptHash,
          blockCount,
          locked,
        }
      );
    }

    throw Errors.contentBlocked(
      "Image generation cannot be combined with file or image attachments.",
      {
        category: "attachment_not_allowed",
      }
    );
  }
}
