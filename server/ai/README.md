# Server AI

AI provider interfaces, Gemini adapter, model registry, context builder, and system prompts.

## Web Search and Function Calling Compatibility (Step F4.1)

In the Gemini API, Google Search grounding (`googleSearch`) and function declarations (`functionDeclarations`) cannot be combined simultaneously inside a single request's `tools` array (the API raises `INVALID_ARGUMENT: Tools may not contain multiple tool types`).

To allow Klecx to search the web and generate documents within the same turn or conversation without mutual exclusion:
- `WEB_SEARCH_TOOL` (`name: "web_search"`) is exposed as a function declaration alongside other function tools (e.g., `create_document`).
- When the model decides to search, `runWebSearch` executes a focused, grounded sub-request (`grounding: true`) and feeds the summarized results + source citations back as the tool response.
- This ensures web search is available by default across all tiers, document generation is never blocked by search, and citations are preserved.

### Inline citations with the tool

Because the answer itself is no longer a grounded request, the provider sends no segment offsets for it, so `applyGroundingInlineMarkers` has nothing to place. Inline `[n]` markers now come from the model:

- `executeWebSearchTool` (`server/services/web-search.ts`) gives each source the citation number it has in the answer (after attachment citations and earlier searches), puts `[n]` markers into the search summary where the provider's segments say a source supports it, and tells the model to cite inline with those numbers.
- The system prompts (`buildSystemPrompt`, `ASK_SYSTEM_INSTRUCTION`) say the same. `Markdown` turns `[n]` into a source popover only when a citation with that number exists.
- Searches are counted only when they run (a failed or empty-query search is not billed). Main answers and Asks share the helper; "Ask all" batches don't search.
