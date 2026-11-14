# Server AI

AI provider interfaces, Gemini adapter, model registry, context builder, and system prompts.

## Web Search and Function Calling Compatibility (Step F4.1)

In the Gemini API, Google Search grounding (`googleSearch`) and function declarations (`functionDeclarations`) cannot be combined simultaneously inside a single request's `tools` array (the API raises `INVALID_ARGUMENT: Tools may not contain multiple tool types`).

To allow Klecx to search the web and generate documents within the same turn or conversation without mutual exclusion:
- `WEB_SEARCH_TOOL` (`name: "web_search"`) is exposed as a function declaration alongside other function tools (e.g., `create_document`).
- When the model decides to search, `runWebSearch` executes a focused, grounded sub-request (`grounding: true`) and feeds the summarized results + source citations back as the tool response.
- This ensures web search is available by default across all tiers, document generation is never blocked by search, and citations are preserved.
