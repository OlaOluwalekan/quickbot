import "server-only";
import { db } from "@/server/db/client";
import type { Entitlements } from "@/server/billing/entitlements";
import type { AiProvider } from "@/server/ai/types";
import {
  applyGroundingInlineMarkers,
  validateCitationUrl,
  type CitationSegment,
} from "@/server/ai/citations";
import { runWebSearch } from "@/server/ai/tools/web-search";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";
import frMessages from "@/messages/fr.json";

/** Most web searches one generation (main answer or Ask answer) may run. */
export const MAX_SEARCHES_PER_GENERATION = 3;

/**
 * Executed web searches by `actorId` since 00:00 UTC today, read from
 * `Generation.usage.searches`. Cancelled and failed generations count too:
 * their searches ran and were billed.
 */
export async function countSearchesToday(actorId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const generations = await db.generation.findMany({
    where: { actorId, createdAt: { gte: startOfDay } },
    select: { usage: true },
  });

  let total = 0;
  for (const g of generations) {
    const s =
      g.usage && typeof g.usage === "object" && !Array.isArray(g.usage)
        ? (g.usage as { searches?: unknown }).searches
        : undefined;
    if (typeof s === "number" && Number.isFinite(s) && s > 0) total += s;
  }
  return total;
}

export interface WebSearchAccess {
  /** Offer the web_search tool for this generation. */
  allowed: boolean;
  /** Search is on but the actor used today's searches (show a notice). */
  reachedDailyCap: boolean;
  /** Actor's UI locale, for the notices shown in the thinking panel. */
  locale: string | null;
}

/**
 * Whether a generation may search the web: the actor's preference (on by
 * default), the workspace owner's plan (the owner pays) and the actor's daily
 * search count against that plan's `searchesPerDay`.
 */
export async function resolveWebSearchAccess(
  actorId: string,
  ownerEntitlements: Entitlements
): Promise<WebSearchAccess> {
  const pref = await db.userPreference.findUnique({
    where: { userId: actorId },
    select: { webSearchEnabled: true, uiLocale: true },
  });
  const locale = pref?.uiLocale ?? null;
  const enabled = pref?.webSearchEnabled ?? true;

  if (!enabled || !ownerEntitlements.features.webSearch) {
    return { allowed: false, reachedDailyCap: false, locale };
  }

  const usedToday = await countSearchesToday(actorId);
  const reachedDailyCap = usedToday >= ownerEntitlements.limits.searchesPerDay;
  return { allowed: !reachedDailyCap, reachedDailyCap, locale };
}

const MESSAGES = { en: enMessages, es: esMessages, fr: frMessages } as const;

/**
 * Notice written into the thinking panel (it is saved with the thought
 * summary, so it is rendered in the actor's UI language on the server).
 */
export function webSearchNotice(
  locale: string | null,
  key: "searchedWeb" | "searchLimitReached",
  values: { query?: string } = {}
): string {
  const lang = (locale ?? "en").slice(0, 2).toLowerCase();
  const messages = MESSAGES[lang as keyof typeof MESSAGES] ?? MESSAGES.en;
  const pattern = messages.Response[key] ?? enMessages.Response[key];
  return pattern.replace("{query}", values.query ?? "");
}

export interface WebSearchCitation {
  index: number;
  url: string;
  title: string | null;
  snippet: string | null;
  source: "GROUNDING";
}

/**
 * Runs one `web_search` tool call and shapes what goes back to the model.
 *
 * Each source gets the citation number it has in the answer (an existing
 * citation with the same URL keeps its number). The summary carries `[n]`
 * markers where the provider says a source supports it, and the response
 * tells the model to put those numbers inline: the answer is not grounded by
 * the provider itself (search runs in a separate request), so inline markers
 * only appear if the model writes them.
 */
export async function executeWebSearchTool(params: {
  args: unknown;
  providerInstance?: AiProvider;
  /** Citations already on the answer (read-only; used for numbering). */
  citations: ReadonlyArray<{ index: number; url: string }>;
  /** Called for each new citation, in order; the caller stores and streams it. */
  onCitation: (citation: WebSearchCitation) => void;
  /** Called with the query just before the search runs (progress events). */
  onSearchStart?: (query: string) => void;
}): Promise<{
  query: string;
  executed: boolean;
  response: Record<string, unknown>;
}> {
  const rawQuery = (params.args as { query?: unknown } | null)?.query;
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 500) : "";

  if (!query) {
    return {
      query,
      executed: false,
      response: { error: "The search query was empty. Answer without searching." },
    };
  }

  params.onSearchStart?.(query);

  let result;
  try {
    result = await runWebSearch(query, {
      modelKey: "text-economy",
      providerInstance: params.providerInstance,
    });
  } catch {
    // Not counted and not billed: the search did not run.
    return {
      query,
      executed: false,
      response: { error: "The web search failed. Answer without it and say so briefly." },
    };
  }

  let nextIndex =
    params.citations.reduce((max, c) => Math.max(max, c.index), 0) + 1;
  const numbered: Array<{
    number: number;
    url: string;
    title: string | null;
    segments?: CitationSegment[];
  }> = [];

  for (const s of result.sources) {
    const check = validateCitationUrl(s.url);
    if (!check.valid || !check.normalizedUrl) continue;
    if (numbered.some((n) => n.url === check.normalizedUrl)) continue;

    const existing = params.citations.find((c) => c.url === check.normalizedUrl);
    let number: number;
    if (existing) {
      number = existing.index;
    } else {
      number = nextIndex++;
      params.onCitation({
        index: number,
        url: check.normalizedUrl,
        title: s.title || check.hostname || null,
        snippet: s.snippet || null,
        source: "GROUNDING",
      });
    }
    numbered.push({
      number,
      url: check.normalizedUrl,
      title: s.title || check.hostname || null,
      segments: s.segments,
    });
  }

  const summary = applyGroundingInlineMarkers(
    result.summary,
    numbered.map((n) => ({ index: n.number, segments: n.segments }))
  ).trim();

  return {
    query,
    executed: true,
    response: {
      summary,
      sources: numbered.map((n) => ({ number: n.number, title: n.title, url: n.url })),
      instructions:
        numbered.length > 0
          ? "Cite these sources inline: right after each sentence or claim that uses a source, " +
            "write its number in square brackets, e.g. [1] or [1][2]. Use only these numbers. " +
            "Do not add a list of sources or URLs at the end; the app shows them."
          : "No sources were found. Do not cite any.",
    },
  };
}
