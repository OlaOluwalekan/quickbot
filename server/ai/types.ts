export type Part =
  | { type: "text"; text: string }
  | { type: "image"; url: string; mime: string }
  | { type: "file"; url: string; mime: string; name?: string };

export type Msg = { role: "user" | "assistant"; parts: Part[] };

export type ToolSpec = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type GenerateRequest = {
  modelKey: string;
  system?: string;
  messages: Msg[];
  maxOutputTokens?: number;
  temperature?: number;
  thinking?: { summaries: boolean; level?: "low" | "medium" | "high" };
  tools?: ToolSpec[];
  grounding?: boolean;
  responseSchema?: object;
  signal?: AbortSignal;
};

export type StreamEvent =
  | { type: "thought_delta"; text: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "citation"; url: string; title?: string; snippet?: string }
  | {
      type: "usage";
      inputTokens: number;
      outputTokens: number;
      thoughtTokens?: number;
      estimated: boolean;
    }
  | { type: "done"; finishReason: "stop" | "length" | "safety" | "tool" };

export type ImageRequest = {
  modelKey: string;
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  numberOfImages?: number;
  signal?: AbortSignal;
};

export type ImageResult = {
  bytes: Buffer;
  mime: string;
  usage?: { images: number };
};

export interface AiProvider {
  id: "gemini" | "openai" | "anthropic";
  stream(req: GenerateRequest): AsyncIterable<StreamEvent>;
  generateImage?(req: ImageRequest): Promise<ImageResult>;
}

export type AiErrorCategory =
  | "invalid_request"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "safety"
  | "unknown";

export class AiError extends Error {
  constructor(
    public category: AiErrorCategory,
    public retryable: boolean,
    public safeMessage: string,
    cause?: unknown
  ) {
    super(safeMessage, { cause });
    this.name = "AiError";
  }
}
