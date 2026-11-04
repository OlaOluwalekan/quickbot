import "server-only";

export type CitationSourceType = "GROUNDING" | "ATTACHMENT" | "MODEL_PROVIDED";

export interface CitationSegment {
  startIndex?: number;
  endIndex?: number;
  text?: string;
}

export interface CitationItem {
  id?: string;
  index: number;
  url: string;
  title?: string | null;
  snippet?: string | null;
  source: CitationSourceType;
  segments?: CitationSegment[];
}

/**
 * Validates that a citation URL is strictly http:// or https:// with a valid hostname.
 * Rejects javascript:, data:, file:, ftp:, relative paths, or malformed URLs.
 */
export function validateCitationUrl(rawUrl: string): {
  valid: boolean;
  normalizedUrl?: string;
  hostname?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false };
  }

  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false };
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { valid: false };
    }
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      hostname: parsed.hostname.replace(/^www\./i, ""),
    };
  } catch {
    return { valid: false };
  }
}

export function extractCitationHostname(rawUrl: string): string {
  const res = validateCitationUrl(rawUrl);
  return res.hostname || "";
}

/**
 * Inserts inline footnote markers `[n]` into `content` using the provider's grounding
 * text segment positions (`endIndex` or exact segment `text`).
 * If segment positions are unavailable or out of bounds, returns `content` unchanged
 * rather than fabricating inline positions.
 */
export function applyGroundingInlineMarkers(
  content: string,
  citations: ReadonlyArray<{ index: number; segments?: CitationSegment[] }>
): string {
  if (!content || citations.length === 0) {
    return content;
  }

  // Collect insertion points: position -> Set of citation indices
  const insertions = new Map<number, Set<number>>();

  for (const cit of citations) {
    if (!cit.segments || cit.segments.length === 0) continue;

    for (const seg of cit.segments) {
      let targetPos: number | null = null;

      if (
        typeof seg.endIndex === "number" &&
        seg.endIndex > 0 &&
        seg.endIndex <= content.length
      ) {
        targetPos = seg.endIndex;
      } else if (seg.text && seg.text.trim().length > 0) {
        const foundIdx = content.indexOf(seg.text);
        if (foundIdx !== -1) {
          targetPos = foundIdx + seg.text.length;
        }
      }

      if (targetPos !== null) {
        let set = insertions.get(targetPos);
        if (!set) {
          set = new Set<number>();
          insertions.set(targetPos, set);
        }
        set.add(cit.index);
      }
    }
  }

  if (insertions.size === 0) {
    return content;
  }

  // Sort positions descending so earlier insertions don't shift later offsets
  const sortedPositions = Array.from(insertions.keys()).sort((a, b) => b - a);
  let result = content;

  for (const pos of sortedPositions) {
    const indices = Array.from(insertions.get(pos)!).sort((a, b) => a - b);
    const markers = indices
      .filter((idx) => {
        // Avoid duplicating [n] if already adjacent at this position
        const sliceAround = result.slice(Math.max(0, pos - 6), Math.min(result.length, pos + 6));
        return !sliceAround.includes(`[${idx}]`);
      })
      .map((idx) => `[${idx}]`)
      .join("");

    if (markers.length > 0) {
      const prefix = result.slice(0, pos);
      const suffix = result.slice(pos);
      const needsLeadingSpace =
        prefix.length > 0 && !/\s$/.test(prefix) && !/[.,;!?)]$/.test(prefix);
      // Place marker right at the segment end (with a space before if mid-word, or directly after)
      result = `${prefix}${needsLeadingSpace ? " " : ""}${markers}${suffix}`;
    }
  }

  return result;
}
