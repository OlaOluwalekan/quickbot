import "server-only";

export type Permission =
  | "workspace.read"
  | "workspace.comment"
  | "workspace.ask"
  | "workspace.generate"
  | "workspace.edit_response"
  | "workspace.regenerate"
  | "workspace.rename"
  | "workspace.archive"
  | "workspace.delete"
  | "workspace.share"
  | "workspace.manage_members"
  | "workspace.upload"
  | "workspace.export";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "workspace.read",
  "workspace.comment",
  "workspace.ask",
  "workspace.generate",
  "workspace.regenerate",
  "workspace.edit_response",
  "workspace.upload",
  "workspace.export",
  "workspace.rename",
  "workspace.archive",
  "workspace.share",
  "workspace.manage_members",
  "workspace.delete",
] as const;

export type EffectiveRole =
  | "VIEWER"
  | "COMMENTER"
  | "EDITOR"
  | "ADMIN"
  | "OWNER";

export type RoleWithNone = EffectiveRole | "NONE";

export const ROLE_RANK: Record<EffectiveRole, number> = {
  VIEWER: 1,
  COMMENTER: 2,
  EDITOR: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function maxRole<
  T extends string | null | undefined,
  U extends string | null | undefined
>(a: T, b: U): EffectiveRole | null {
  const roleA = a && a in ROLE_RANK ? (a as EffectiveRole) : null;
  const roleB = b && b in ROLE_RANK ? (b as EffectiveRole) : null;
  if (!roleA && !roleB) return null;
  if (!roleA) return roleB;
  if (!roleB) return roleA;
  return (ROLE_RANK[roleA] ?? 0) >= (ROLE_RANK[roleB] ?? 0) ? roleA : roleB;
}

const base = {
  VIEWER: ["workspace.read"],
  COMMENTER: ["workspace.read", "workspace.comment"],
  EDITOR: [
    "workspace.read",
    "workspace.comment",
    "workspace.ask",
    "workspace.generate",
    "workspace.regenerate",
    "workspace.edit_response",
    "workspace.upload",
    "workspace.export",
  ],
  ADMIN: [
    "workspace.read",
    "workspace.comment",
    "workspace.ask",
    "workspace.generate",
    "workspace.regenerate",
    "workspace.edit_response",
    "workspace.upload",
    "workspace.export",
    "workspace.rename",
    "workspace.archive",
    "workspace.share",
    "workspace.manage_members",
  ],
} as const satisfies Record<Exclude<EffectiveRole, "OWNER">, Permission[]>;

const rolePermissionSets: Record<EffectiveRole, ReadonlySet<Permission>> = {
  VIEWER: new Set<Permission>(base.VIEWER),
  COMMENTER: new Set<Permission>(base.COMMENTER),
  EDITOR: new Set<Permission>(base.EDITOR),
  ADMIN: new Set<Permission>(base.ADMIN),
  OWNER: new Set<Permission>(ALL_PERMISSIONS),
};

export function computeCapabilities(
  role: EffectiveRole,
  opts?: {
    canComment?: boolean | null;
    canAsk?: boolean | null;
    suspended?: boolean;
  }
): Set<Permission> {
  if (opts?.suspended) {
    return new Set<Permission>(["workspace.read"]);
  }

  const basePermissions = getPermissionsForRole(role);
  const set = new Set<Permission>(basePermissions);

  if (role === "OWNER" || role === "ADMIN") {
    // Admin and Owner have fixed capabilities
    return set;
  }

  if (opts?.canComment === true) {
    set.add("workspace.comment");
  } else if (opts?.canComment === false) {
    set.delete("workspace.comment");
  }

  if (opts?.canAsk === true) {
    set.add("workspace.ask");
  } else if (opts?.canAsk === false) {
    set.delete("workspace.ask");
  }

  return set;
}

export function can(
  target: RoleWithNone | ReadonlySet<Permission> | Set<Permission> | null | undefined,
  perm: Permission
): boolean {
  if (!target || target === "NONE") {
    return false;
  }
  if (typeof target === "object" && "has" in target) {
    return target.has(perm);
  }
  return rolePermissionSets[target as EffectiveRole]?.has(perm) ?? false;
}

export function getPermissionsForRole(
  role: RoleWithNone | null | undefined
): readonly Permission[] {
  if (!role || role === "NONE") {
    return [];
  }
  if (role === "OWNER") {
    return ALL_PERMISSIONS;
  }
  return base[role];
}
