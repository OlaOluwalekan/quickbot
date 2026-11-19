/**
 * Klecx Billing Plans & Entitlements Source of Truth (§4.4)
 * Both client marketing pages and server enforcement import from here.
 */

export interface PlanLimits {
  attachmentsPerWorkspace: number;
  maxFileMB: number;
  members: number;
  exportFormats: ("md" | "pdf" | "docx")[];
  grounding: boolean;
  images: boolean;
  searchesPerDay: number;
  voiceSecondsPerDay: number;
}

export interface PlanDefinition {
  id: "FREE" | "LITE" | "STANDARD" | "PRO";
  name: string;
  badge?: string;
  popular?: boolean;
  tagline: string;
  priceMonthly: number;
  priceYearly: number; // Includes 2 months free
  credits: number;
  dailyCapCredits?: number;
  dailyCapPct?: number;
  maxConcurrent: number;
  models: string[];
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<"FREE" | "LITE" | "STANDARD" | "PRO", PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Plans.FREE.name",
    tagline: "Plans.FREE.tagline",
    priceMonthly: 0,
    priceYearly: 0,
    credits: 100,
    dailyCapCredits: 30,
    maxConcurrent: 1,
    models: ["text-economy"],
    limits: {
      attachmentsPerWorkspace: 3,
      maxFileMB: 5,
      members: 0,
      exportFormats: ["md"],
      grounding: true,
      images: false,
      searchesPerDay: 10,
      voiceSecondsPerDay: 120,
    },
    features: [
      "Plans.FREE.features.credits",
      "Plans.FREE.features.dailyCap",
      "Plans.FREE.features.concurrency",
      "Plans.FREE.features.models",
      "Plans.FREE.features.search",
      "Plans.FREE.features.attachments",
      "Plans.FREE.features.documents",
      "Plans.FREE.features.voice",
      "Plans.FREE.features.exports",
      "Plans.FREE.features.sharing",
    ],
  },
  LITE: {
    id: "LITE",
    name: "Plans.LITE.name",
    tagline: "Plans.LITE.tagline",
    priceMonthly: 4.99,
    priceYearly: 49,
    credits: 800,
    dailyCapPct: 0.25,
    maxConcurrent: 2,
    models: ["text-economy", "text-standard", "image-standard"],
    limits: {
      attachmentsPerWorkspace: 10,
      maxFileMB: 15,
      members: 0,
      exportFormats: ["md", "pdf", "docx"],
      grounding: true,
      images: true,
      searchesPerDay: 50,
      voiceSecondsPerDay: 600,
    },
    features: [
      "Plans.LITE.features.credits",
      "Plans.LITE.features.dailyCap",
      "Plans.LITE.features.concurrency",
      "Plans.LITE.features.models",
      "Plans.LITE.features.images",
      "Plans.LITE.features.search",
      "Plans.LITE.features.attachments",
      "Plans.LITE.features.documents",
      "Plans.LITE.features.voice",
      "Plans.LITE.features.exports",
    ],
  },
  STANDARD: {
    id: "STANDARD",
    name: "Plans.STANDARD.name",
    badge: "Plans.STANDARD.badge",
    popular: true,
    tagline: "Plans.STANDARD.tagline",
    priceMonthly: 9.99,
    priceYearly: 99,
    credits: 1800,
    dailyCapPct: 0.25,
    maxConcurrent: 3,
    models: ["text-economy", "text-standard", "image-standard"],
    limits: {
      attachmentsPerWorkspace: 25,
      maxFileMB: 25,
      members: 1,
      exportFormats: ["md", "pdf", "docx"],
      grounding: true,
      images: true,
      searchesPerDay: 100,
      voiceSecondsPerDay: 1200,
    },
    features: [
      "Plans.STANDARD.features.credits",
      "Plans.STANDARD.features.dailyCap",
      "Plans.STANDARD.features.concurrency",
      "Plans.STANDARD.features.models",
      "Plans.STANDARD.features.images",
      "Plans.STANDARD.features.search",
      "Plans.STANDARD.features.attachments",
      "Plans.STANDARD.features.documents",
      "Plans.STANDARD.features.voice",
      "Plans.STANDARD.features.collaborators",
      "Plans.STANDARD.features.exports",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Plans.PRO.name",
    tagline: "Plans.PRO.tagline",
    priceMonthly: 16.99,
    priceYearly: 169,
    credits: 3500,
    dailyCapPct: 0.2,
    maxConcurrent: 5,
    models: ["text-economy", "text-standard", "image-standard", "text-advanced"],
    limits: {
      attachmentsPerWorkspace: 50,
      maxFileMB: 50,
      members: 3,
      exportFormats: ["md", "pdf", "docx"],
      grounding: true,
      images: true,
      searchesPerDay: 200,
      voiceSecondsPerDay: 2400,
    },
    features: [
      "Plans.PRO.features.credits",
      "Plans.PRO.features.dailyCap",
      "Plans.PRO.features.concurrency",
      "Plans.PRO.features.models",
      "Plans.PRO.features.images",
      "Plans.PRO.features.search",
      "Plans.PRO.features.attachments",
      "Plans.PRO.features.documents",
      "Plans.PRO.features.voice",
      "Plans.PRO.features.collaborators",
      "Plans.PRO.features.exports",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

/**
 * English plan names for developer-facing error messages and logs only.
 * `PLANS[x].name` is a message key (`Plans.<PLAN>.name`); UI resolves it
 * with next-intl, and users see `Errors.api.<code>` instead of these.
 */
export const PLAN_LOG_NAMES: Record<PlanKey, string> = {
  FREE: "Free",
  LITE: "Lite",
  STANDARD: "Standard",
  PRO: "Pro",
};

const userPlanOverrides = new Map<string, PlanKey>();

export function setUserPlanOverride(userId: string, plan: PlanKey | null): void {
  if (plan === null) {
    userPlanOverrides.delete(userId);
  } else {
    userPlanOverrides.set(userId, plan);
  }
}

export function getUserPlanOverride(userId: string): PlanKey | undefined {
  return userPlanOverrides.get(userId);
}

export function clearUserPlanOverrides(): void {
  userPlanOverrides.clear();
}

export function getDailyCapForPlan(plan: PlanKey): number {
  const def = PLANS[plan] ?? PLANS.FREE;
  if (def.dailyCapCredits !== undefined) {
    return def.dailyCapCredits;
  }
  return Math.ceil(def.credits * (def.dailyCapPct ?? 0.25));
}
