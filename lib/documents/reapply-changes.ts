import { applyPatch, structuredPatch } from "diff";

/**
 * Carries the changes made between `base` and `mine` over to `latest`
 * (a newer saved text). Changes are matched line by line, so two people
 * editing different paragraphs both keep their work.
 *
 * Returns null when a change can't be placed, for example when both sides
 * edited the same paragraph. The caller must then keep `mine` untouched.
 */
export function reapplyChanges(
  base: string,
  mine: string,
  latest: string
): string | null {
  if (mine === base) return latest;
  if (latest === base) return mine;

  const patch = structuredPatch("base", "mine", base, mine);
  const merged = applyPatch(latest, patch, { fuzzFactor: 2 });
  return merged === false ? null : merged;
}
