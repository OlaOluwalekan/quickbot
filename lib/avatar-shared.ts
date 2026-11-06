export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstPart = parts[0];
    const secondPart = parts[1];
    if (firstPart && secondPart) {
      const c1 = firstPart.charAt(0);
      const c2 = secondPart.charAt(0);
      return (c1 + c2).toUpperCase();
    }
    if (firstPart && firstPart.length >= 2) {
      return firstPart.slice(0, 2).toUpperCase();
    }
    if (firstPart && firstPart.length === 1) {
      return firstPart.charAt(0).toUpperCase();
    }
  }
  if (email && email.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return "?";
}

export const AVATAR_COLOR_PALETTES = [
  "bg-primary/15 text-primary",
  "bg-accent-soft text-accent",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-surface-2 text-fg",
] as const;

export function getAvatarColorClass(userIdOrToken: string): string {
  if (!userIdOrToken) return AVATAR_COLOR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < userIdOrToken.length; i++) {
    hash = (hash << 5) - hash + userIdOrToken.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLOR_PALETTES.length;
  return AVATAR_COLOR_PALETTES[index] ?? AVATAR_COLOR_PALETTES[0];
}
