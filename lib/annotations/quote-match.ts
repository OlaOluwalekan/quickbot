/**
 * Finds a highlighted passage inside the markdown source it was selected from.
 *
 * The browser sends the passage as the reader sees it (the rendered text).
 * The stored text is markdown, so the two differ as soon as a selection
 * crosses a paragraph break, a list item, bold text, a link, a table cell or
 * a formula. Comparing them character by character rejects valid selections.
 *
 * Both sides are reduced to their letters and digits. The passage must then
 * appear in the source, in order. Short stretches may be skipped on either
 * side: link addresses and list numbers exist only in the source; a rendered
 * formula adds text that exists only on the page.
 */

/** Characters compared between the passage and the source. */
const SIGNIFICANT = /[\p{L}\p{N}]/u;

/** Length of the piece used to find where the two texts line up again. */
const SEED_LENGTH = 5;
/** Longest stretch of source text that may be missing from the passage. */
const MAX_SOURCE_SKIP = 600;
/** Longest stretch of the passage that may be missing from the source. */
const MAX_QUOTE_SKIP = 400;
/** Share of the passage that must be found in the source. */
const MIN_MATCHED_SHARE = 0.8;
/** Starting points tried before giving up. */
const MAX_START_CANDIDATES = 50;

export interface QuoteLocation {
  /** Offset in the source where the passage starts. */
  start: number;
  /** Offset in the source just after the passage. */
  end: number;
}

interface Skeleton {
  text: string;
  /** For each kept character, its offset in the original string. */
  offsets: number[];
}

function skeletonOf(value: string): Skeleton {
  let text = "";
  const offsets: number[] = [];
  let offset = 0;
  // Compare without accents' composition differences and without case.
  for (const char of value) {
    if (SIGNIFICANT.test(char)) {
      const folded = char.normalize("NFKC").toLowerCase();
      for (const unit of folded) {
        text += unit;
        offsets.push(offset);
      }
    }
    offset += char.length;
  }
  return { text, offsets };
}

/**
 * Aligns `quote` on `source` from `from`, both already reduced to letters and
 * digits. Returns the end of the match in `source`, or -1.
 */
function alignFrom(source: string, quote: string, from: number): number {
  let q = 0;
  let s = from;
  let matched = 0;
  let lastMatchEnd = from;

  while (q < quote.length) {
    if (s < source.length && source[s] === quote[q]) {
      q++;
      s++;
      matched++;
      lastMatchEnd = s;
      continue;
    }

    // The texts differ here. Find the next place where they agree again.
    // The last few characters may have matched by chance (the "n" of a
    // formula's "N" and of the next word), so look slightly behind as well.
    const windowStart = Math.max(from, s - (SEED_LENGTH - 1));
    const windowText = source.slice(windowStart, s + MAX_SOURCE_SKIP + SEED_LENGTH);
    let resumed = false;
    for (let skip = 0; skip <= MAX_QUOTE_SKIP && q + skip < quote.length; skip++) {
      const seed = quote.slice(q + skip, q + skip + SEED_LENGTH);
      // A short seed matches anywhere; only accept it at the passage's end.
      if (seed.length < SEED_LENGTH && skip > 0) break;
      const idx = windowText.indexOf(seed);
      if (idx !== -1) {
        q += skip;
        s = windowStart + idx;
        resumed = true;
        break;
      }
    }
    if (!resumed) break;
  }

  return matched >= quote.length * MIN_MATCHED_SHARE ? lastMatchEnd : -1;
}

/**
 * Returns where `quote` (rendered text) sits in `source` (markdown), or `null`
 * when the passage doesn't come from that text.
 */
export function locateQuote(source: string, quote: string): QuoteLocation | null {
  if (!quote) return null;

  const direct = source.indexOf(quote);
  if (direct !== -1) return { start: direct, end: direct + quote.length };

  const src = skeletonOf(source);
  const qt = skeletonOf(quote);

  if (qt.text.length === 0) {
    // Only punctuation or spaces were selected: compare without whitespace.
    const compactQuote = quote.replace(/\s+/g, "");
    if (!compactQuote) return null;
    const idx = source.replace(/\s+/g, "").indexOf(compactQuote);
    return idx === -1 ? null : { start: 0, end: 0 };
  }

  const toLocation = (from: number, to: number): QuoteLocation => ({
    start: src.offsets[from]!,
    end: src.offsets[to - 1]! + 1,
  });

  const whole = src.text.indexOf(qt.text);
  if (whole !== -1) return toLocation(whole, whole + qt.text.length);

  const seed = qt.text.slice(0, SEED_LENGTH);
  let from = src.text.indexOf(seed);
  for (let tries = 0; from !== -1 && tries < MAX_START_CANDIDATES; tries++) {
    const end = alignFrom(src.text, qt.text, from);
    if (end !== -1) return toLocation(from, end);
    from = src.text.indexOf(seed, from + 1);
  }

  return null;
}

/** True when `quote` is a passage of `source`. */
export function quoteIsFromSource(source: string, quote: string): boolean {
  return locateQuote(source, quote) !== null;
}
