/**
 * Pure layout and serialization logic for nested Ask & document columns.
 * Implements §2.3: column stack with collapsible spines.
 * No React dependencies.
 */

export type StackEntry =
  | { kind: "annotation"; id: string }
  | { kind: "document"; id: string };

export type ColumnLayout = {
  index: number;
  mode: "full" | "spine";
  width: number;
  isGrouped?: boolean;
  groupedCount?: number;
  groupedIndices?: number[];
};

export interface ColumnLayoutPrefs {
  mainMin: number;
  colMin: number;
  colPreferred: number;
  spine: number;
  maxFull: number;
}

export const DEFAULT_LAYOUT_PREFS: ColumnLayoutPrefs = {
  mainMin: 480,
  colMin: 420,
  colPreferred: 520,
  spine: 44,
  maxFull: 3,
};

/**
 * Computes column widths and display modes (full vs spine) for the workspace conversation
 * and its nested thread stack.
 *
 * Column 0 is the main conversation.
 * Columns 1..levels correspond to stack entries (levels = count of stack entries).
 *
 * Rules:
 * 1. Readable minimums: main column >= mainMin (480), Ask column >= colMin (420).
 * 2. Deepest column is always fully visible. Walking backwards, columns are shown fully
 *    while they fit; the rest (oldest first, including main conversation) collapse into
 *    spine px (44px) spines. Never more than maxFull (3) full columns.
 * 3. When more than 6 spines would show, the oldest ones merge into a single `+N` spine.
 */
export function computeColumnLayout(
  available: number,
  count: number,
  userPrefs?: Partial<ColumnLayoutPrefs>
): ColumnLayout[] {
  const prefs: ColumnLayoutPrefs = { ...DEFAULT_LAYOUT_PREFS, ...userPrefs };

  // Total columns in stack = 1 (main conversation) + count (stack entries)
  const totalColumns = 1 + Math.max(0, count);

  // If only main conversation is open (count = 0)
  if (totalColumns === 1) {
    return [
      {
        index: 0,
        mode: "full",
        width: Math.max(0, available),
      },
    ];
  }

  // Determine how many full columns can fit (between 1 and maxFull).
  // Walking backwards from the deepest column (totalColumns - 1):
  // The deepest column is always full.
  let fullCount = 1;

  for (let candidateFull = Math.min(totalColumns, prefs.maxFull); candidateFull >= 1; candidateFull--) {
    const candidateSpines = totalColumns - candidateFull;
    // Calculate spine width needed
    const spineWidth =
      candidateSpines > 6
        ? (1 + 5) * prefs.spine // 1 grouped + 5 individual
        : candidateSpines * prefs.spine;

    const remainingForFull = available - spineWidth;

    // Check minimum width requirement for each candidate full column:
    // If column 0 (main conversation) is among the full columns, it needs mainMin;
    // all other full columns need colMin.
    const mainIsFull = candidateSpines === 0;
    const requiredMin = mainIsFull
      ? prefs.mainMin + (candidateFull - 1) * prefs.colMin
      : candidateFull * prefs.colMin;

    if (remainingForFull >= requiredMin) {
      fullCount = candidateFull;
      break;
    }
  }

  const spineCount = totalColumns - fullCount;
  const firstFullIndex = spineCount;

  // Compute available width for the full columns
  const visibleSpineCount = spineCount > 6 ? 6 : spineCount;
  const totalSpineWidth = visibleSpineCount * prefs.spine;
  const availableForFull = Math.max(0, available - totalSpineWidth);

  // Allocate widths among full columns:
  // If there is 1 full column: takes all availableForFull.
  // If there are multiple:
  // The deepest column prefers `colPreferred` (clamped so every full column gets at least its min).
  const fullWidths: number[] = new Array(fullCount).fill(0);

  if (fullCount === 1) {
    fullWidths[0] = availableForFull;
  } else {
    // Determine target widths
    // Default to sharing evenly or respecting colPreferred
    const minWidths: number[] = fullWidths.map((_, i) => {
      const colIdx = firstFullIndex + i;
      return colIdx === 0 ? prefs.mainMin : prefs.colMin;
    });

    const totalMin = minWidths.reduce((a, b) => a + b, 0);

    if (availableForFull <= totalMin) {
      // Squeeze at minimums
      for (let i = 0; i < fullCount; i++) {
        fullWidths[i] = minWidths[i] ?? (i === 0 && firstFullIndex === 0 ? prefs.mainMin : prefs.colMin);
      }
    } else {
      // Allocate surplus: deepest column gets up to colPreferred, remainder distributed
      let remainingSurplus = availableForFull - totalMin;

      // Start each at its minimum
      for (let i = 0; i < fullCount; i++) {
        fullWidths[i] = minWidths[i] ?? (i === 0 && firstFullIndex === 0 ? prefs.mainMin : prefs.colMin);
      }

      // Try giving the deepest column its preferred width
      const deepestIdx = fullCount - 1;
      const deepestMin = minWidths[deepestIdx] ?? prefs.colMin;
      const desiredExtra = Math.max(0, prefs.colPreferred - deepestMin);
      const extraForDeepest = Math.min(remainingSurplus, desiredExtra);
      fullWidths[deepestIdx] = (fullWidths[deepestIdx] ?? deepestMin) + extraForDeepest;
      remainingSurplus -= extraForDeepest;

      // If surplus still remains, distribute across other columns
      if (remainingSurplus > 0) {
        const perCol = Math.floor(remainingSurplus / fullCount);
        for (let i = 0; i < fullCount; i++) {
          fullWidths[i] = (fullWidths[i] ?? 0) + perCol;
        }
        fullWidths[deepestIdx] = (fullWidths[deepestIdx] ?? 0) + (remainingSurplus % fullCount);
      }
    }
  }

  // Build final layout items
  const result: ColumnLayout[] = [];

  // Grouped spine handling if spineCount > 6
  if (spineCount > 6) {
    const groupedSpinesCount = spineCount - 5;
    const groupedIndices = Array.from({ length: groupedSpinesCount }, (_, i) => i);

    result.push({
      index: 0,
      mode: "spine",
      width: prefs.spine,
      isGrouped: true,
      groupedCount: groupedSpinesCount,
      groupedIndices,
    });

    // The remaining 5 individual spines
    for (let i = groupedSpinesCount; i < spineCount; i++) {
      result.push({
        index: i,
        mode: "spine",
        width: prefs.spine,
      });
    }
  } else {
    // Normal spines (all individual)
    for (let i = 0; i < spineCount; i++) {
      result.push({
        index: i,
        mode: "spine",
        width: prefs.spine,
      });
    }
  }

  // Add full columns
  for (let i = 0; i < fullCount; i++) {
    const colIdx = firstFullIndex + i;
    result.push({
      index: colIdx,
      mode: "full",
      width: fullWidths[i] ?? (colIdx === 0 ? prefs.mainMin : prefs.colMin),
    });
  }

  return result;
}

/**
 * Parses the thread URL parameter: "a:<id>.a:<id>.d:<id>"
 * - a:<id> -> { kind: "annotation", id }
 * - d:<id> -> { kind: "document", id }
 */
export function parseThreadParam(v: string | null | undefined): StackEntry[] {
  if (!v || typeof v !== "string") {
    return [];
  }

  const segments = v.split(".").map((s) => s.trim()).filter(Boolean);
  const entries: StackEntry[] = [];

  for (const seg of segments) {
    if (seg.startsWith("a:")) {
      const id = seg.slice(2).trim();
      if (id) {
        entries.push({ kind: "annotation", id });
      }
    } else if (seg.startsWith("d:")) {
      const id = seg.slice(2).trim();
      if (id) {
        entries.push({ kind: "document", id });
      }
    }
  }

  return entries;
}

/**
 * Serializes the thread stack to URL format: "a:<id>.a:<id>.d:<id>"
 */
export function serializeThreadParam(s: StackEntry[]): string {
  if (!s || s.length === 0) {
    return "";
  }

  return s
    .map((entry) => {
      const prefix = entry.kind === "document" ? "d:" : "a:";
      return `${prefix}${entry.id}`;
    })
    .join(".");
}
