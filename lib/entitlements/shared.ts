import { PLANS, type PlanKey, type PlanLimits } from "@/server/billing/plans";

export type SharedModelKey =
  | "text-economy"
  | "text-standard"
  | "image-standard";

export const ALL_MODEL_KEYS: readonly SharedModelKey[] = [
  "text-economy",
  "text-standard",
  "image-standard",
] as const;

export const PLAN_ORDER: readonly PlanKey[] = [
  "FREE",
  "LITE",
  "STANDARD",
  "PRO",
] as const;

export type EntitlementFeatures = {
  images: boolean;
  webSearch: boolean;
  documentReview: boolean;
  voiceInput: boolean;
  collaboration: boolean;
};

export type Entitlements = {
  plan: PlanKey; // effective plan
  models: SharedModelKey[]; // allowed model keys
  limits: PlanLimits & { searchesPerDay: number; voiceSecondsPerDay: number };
  features: EntitlementFeatures;
};

export type GateReason =
  | { code: "requires_plan"; plan: PlanKey }
  | { code: "member_limit"; limit: number }
  | { code: "daily_cap" }
  | { code: "no_permission"; capability: string }
  | { code: "max_depth"; depth: number }
  /** The workspace owner's plan doesn't include it (the viewer can't upgrade it). */
  | { code: "owner_plan"; plan: PlanKey };

export type GateableFeature =
  | keyof EntitlementFeatures
  | SharedModelKey
  | "md"
  | "pdf"
  | "docx"
  | { feature: keyof EntitlementFeatures }
  | { model: string }
  | { exportFormat: "md" | "pdf" | "docx" };

/**
 * Pure, isomorphic computation of entitlements for a given plan key.
 */
export function entitlementsForPlan(plan: PlanKey): Entitlements {
  const normalizedPlan: PlanKey = plan in PLANS ? plan : "FREE";
  const def = PLANS[normalizedPlan];

  const allowedModels = ALL_MODEL_KEYS.filter((m) => def.models.includes(m));

  return {
    plan: normalizedPlan,
    models: allowedModels,
    limits: {
      ...def.limits,
      exportFormats: [...def.limits.exportFormats],
    },
    features: {
      images: Boolean(def.limits.images),
      webSearch: Boolean(def.limits.grounding),
      documentReview: true,
      voiceInput: def.limits.voiceSecondsPerDay > 0,
      collaboration: def.limits.members > 0,
    },
  };
}

/**
 * Checks whether the given entitlements allow a feature, model, or export format.
 */
export function canUse(
  entitlements: Entitlements | null | undefined,
  feature: GateableFeature
): boolean {
  const ent = entitlements ?? entitlementsForPlan("FREE");

  if (typeof feature === "string") {
    if (feature in ent.features) {
      return Boolean(ent.features[feature as keyof EntitlementFeatures]);
    }
    if (feature === "md" || feature === "pdf" || feature === "docx") {
      return ent.limits.exportFormats.includes(feature);
    }
    return ent.models.includes(feature as SharedModelKey);
  }

  if ("feature" in feature) {
    return Boolean(ent.features[feature.feature]);
  }

  if ("model" in feature) {
    return ent.models.includes(feature.model as SharedModelKey);
  }

  if ("exportFormat" in feature) {
    return ent.limits.exportFormats.includes(feature.exportFormat);
  }

  return false;
}

/**
 * Returns a `GateReason` if the feature/model/exportFormat is locked for the given entitlements,
 * or `null` if it is allowed.
 */
export function getGateReason(
  entitlements: Entitlements | null | undefined,
  feature: GateableFeature
): GateReason | null {
  if (canUse(entitlements, feature)) {
    return null;
  }

  for (const candidatePlan of PLAN_ORDER) {
    if (canUse(entitlementsForPlan(candidatePlan), feature)) {
      return { code: "requires_plan", plan: candidatePlan };
    }
  }

  return { code: "requires_plan", plan: "PRO" };
}

/**
 * Gate for one download format in a workspace. The workspace owner's plan
 * decides the formats (decided 2026-11-14); Word and PDF also need the
 * `workspace.export` capability (Markdown too when `markdownNeedsExport`).
 */
export function exportFormatGateReason(args: {
  format: "md" | "pdf" | "docx";
  /** Formats of the owner's plan; unknown (still loading) = allowed. */
  ownerFormats: readonly string[] | undefined;
  /** The viewer owns the workspace: an upgrade of their own plan unlocks it. */
  isOwner: boolean;
  /** Caller holds `workspace.export` (needed for Word / PDF). */
  canExport?: boolean;
  /** Markdown needs `workspace.export` too (response exports; not a generated document's own text). */
  markdownNeedsExport?: boolean;
  /** Label for the "no permission to …" tooltip. */
  exportCapabilityLabel: string;
}): GateReason | null {
  const { format, ownerFormats, isOwner, canExport, exportCapabilityLabel } = args;
  if ((format !== "md" || args.markdownNeedsExport) && canExport === false) {
    return { code: "no_permission", capability: exportCapabilityLabel };
  }
  if (!ownerFormats || ownerFormats.includes(format)) return null;
  const plan =
    PLAN_ORDER.find((p) => PLANS[p].limits.exportFormats.includes(format)) ?? "PRO";
  return isOwner ? { code: "requires_plan", plan } : { code: "owner_plan", plan };
}
