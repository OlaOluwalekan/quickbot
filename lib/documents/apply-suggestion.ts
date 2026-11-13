export interface SuggestionTarget {
  exact: string;
  prefix: string;
  suffix: string;
  replacement: string;
}

export type ApplySuggestionResult =
  | { ok: true; next: string }
  | { ok: false; reason: "not_found" | "ambiguous" };

function longestCommonSuffixLen(a: string, b: string): number {
  let count = 0;
  const max = Math.min(a.length, b.length);
  while (count < max && a[a.length - 1 - count] === b[b.length - 1 - count]) {
    count++;
  }
  return count;
}

function longestCommonPrefixLen(a: string, b: string): number {
  let count = 0;
  const max = Math.min(a.length, b.length);
  while (count < max && a[count] === b[count]) {
    count++;
  }
  return count;
}

/**
 * Applies a replacement to the Markdown source using exact/prefix/suffix quote matching.
 */
export function applySuggestion(
  source: string,
  s: SuggestionTarget
): ApplySuggestionResult {
  const exact = s.exact;
  if (!exact) {
    return { ok: false, reason: "not_found" };
  }

  const indices: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= source.length - exact.length) {
    const idx = source.indexOf(exact, searchFrom);
    if (idx === -1) break;
    indices.push(idx);
    searchFrom = idx + 1;
  }

  if (indices.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  let chosenIndex = indices[0]!;

  if (indices.length > 1) {
    const prefix = s.prefix ?? "";
    const suffix = s.suffix ?? "";
    if (!prefix && !suffix) {
      return { ok: false, reason: "ambiguous" };
    }

    const scored = indices.map((idx) => {
      const before = prefix
        ? source.slice(Math.max(0, idx - prefix.length), idx)
        : "";
      const after = suffix
        ? source.slice(idx + exact.length, idx + exact.length + suffix.length)
        : "";
      const prefixScore = prefix ? longestCommonSuffixLen(before, prefix) : 0;
      const suffixScore = suffix ? longestCommonPrefixLen(after, suffix) : 0;
      return { idx, score: prefixScore + suffixScore };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    const second = scored[1]!;

    if (best.score === 0 || best.score === second.score) {
      return { ok: false, reason: "ambiguous" };
    }
    chosenIndex = best.idx;
  }

  const next =
    source.slice(0, chosenIndex) +
    s.replacement +
    source.slice(chosenIndex + exact.length);

  return { ok: true, next };
}

/**
 * Reads a stored quick fix (`Annotation.suggestion`, JSON). Returns null when
 * the annotation is a comment without a replacement.
 */
export function toSuggestionTarget(value: unknown): SuggestionTarget | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.exact !== "string" || !v.exact) return null;
  if (typeof v.replacement !== "string") return null;
  return {
    exact: v.exact,
    prefix: typeof v.prefix === "string" ? v.prefix : "",
    suffix: typeof v.suffix === "string" ? v.suffix : "",
    replacement: v.replacement,
  };
}
