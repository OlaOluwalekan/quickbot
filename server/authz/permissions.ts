import "server-only";

export type Permission =
  | "workspace.read"
  | "workspace.generate"
  | "workspace.annotate"
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
  "workspace.annotate",
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

const base = {
  VIEWER: ["workspace.read"],
  COMMENTER: ["workspace.read", "workspace.annotate"],
  EDITOR: [
    "workspace.read",
    "workspace.annotate",
    "workspace.generate",
    "workspace.regenerate",
    "workspace.edit_response",
    "workspace.upload",
    "workspace.export",
  ],
  ADMIN: [
    "workspace.read",
    "workspace.annotate",
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

export function can(
  role: RoleWithNone | null | undefined,
  perm: Permission
): boolean {
  if (!role || role === "NONE") {
    return false;
  }
  return rolePermissionSets[role].has(perm);
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
