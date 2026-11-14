import "server-only";
import { type ToolSpec, type AiProvider } from "../types";
import { streamAi } from "../index";
import { validateCitationUrl, type CitationSegment } from "../citations";

export const WEB_SEARCH_TOOL: ToolSpec = {
  name: "web_search",
  description:
    "Search the web for current or verifiable information. Use it for recent events, prices, statistics, documentation or anything you are not sure about. Do not use it for general knowledge, writing or math.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up on the web.",
      },
    },
    required: ["query"],
  },
};

export interface WebSearchSource {
  url: string;
  title?: string;
  snippet?: string;
  /** Where in `summary` this source is used (from the provider's grounding). */
  segments?: CitationSegment[];
}

export interface WebSearchResult {
  summary: string;
  sources: WebSearchSource[];
}

/**
 * Executes a short grounded search request to retrieve factual information and verifiable sources.
 * Returns compact summary (<= 1,500 tokens) and validated source citations.
 */
export async function runWebSearch(
  query: string,
  ctx: {
    modelKey?: string;
    providerInstance?: AiProvider;
  } = {}
): Promise<WebSearchResult> {
  const stream = streamAi(
    {
      modelKey: ctx.modelKey || "text-economy",
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: `Search query: ${query}\n\nProvide a factual, compact summary of the latest information found (under 1500 tokens). Include relevant details, dates, or prices.`,
            },
          ],
        },
      ],
      grounding: true,
      maxOutputTokens: 1500,
      thinking: { summaries: false },
    },
    {
      providerInstance: ctx.providerInstance,
    }
  );

  let summary = "";
  const sources: WebSearchSource[] = [];

  for await (const event of stream) {
    if (event.type === "text_delta") {
      summary += event.text;
    } else if (event.type === "citation") {
      const check = validateCitationUrl(event.url);
      if (check.valid && check.normalizedUrl) {
        const existing = sources.find((s) => s.url === check.normalizedUrl);
        if (existing) {
          if (event.segments?.length) {
            existing.segments = [...(existing.segments ?? []), ...event.segments];
          }
        } else {
          sources.push({
            url: check.normalizedUrl,
            title: event.title || check.hostname || undefined,
            snippet: event.snippet || undefined,
            segments: event.segments?.length ? [...event.segments] : undefined,
          });
        }
      }
    }
  }

  return {
    // Not trimmed: the sources' segment offsets point into this text.
    summary: summary.trim() ? summary : "No relevant search results found.",
    sources,
  };
}
