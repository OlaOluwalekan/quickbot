import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/server/env";
import {
  AiProvider,
  GenerateRequest,
  ImageRequest,
  ImageResult,
  StreamEvent,
} from "../types";
import { normalizeGeminiError } from "../errors";

let globalClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!globalClient) {
    globalClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return globalClient;
}

export class GeminiProvider implements AiProvider {
  public readonly id = "gemini" as const;
  private client: GoogleGenAI;

  constructor(client?: GoogleGenAI) {
    this.client = client || getGeminiClient();
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
    const contents = req.messages.map((m) => {
      const role = m.role === "assistant" ? "model" : "user";
      const parts = m.parts.map((p) => {
        if (p.type === "text") {
          return { text: p.text };
        }
        if (p.type === "image" || p.type === "file") {
          const match = p.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match && match[1] && match[2]) {
            return {
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            };
          }
          return {
            inlineData: {
              mimeType: p.mime,
              data: p.url,
            },
          };
        }
        return { text: "" };
      });
      return { role, parts };
    });

    const config: Record<string, unknown> = {
      maxOutputTokens: req.maxOutputTokens,
      temperature: req.temperature,
      thinkingConfig: {
        includeThoughts: true,
      },
    };

    if (req.system) {
      config.systemInstruction = {
        parts: [{ text: req.system }],
      };
    }

    if (req.grounding) {
      config.tools = [{ googleSearch: {} }];
    } else if (req.tools && req.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    if (req.responseSchema) {
      config.responseSchema = req.responseSchema;
    }

    let inputCharCount = 0;
    for (const msg of req.messages) {
      for (const p of msg.parts) {
        if (p.type === "text") inputCharCount += p.text.length;
      }
    }
    let outputCharCount = 0;
    let emittedUsage = false;
    type DoneFinishReason = Extract<StreamEvent, { type: "done" }>["finishReason"];
    let finishReason: DoneFinishReason = "stop";

    let responseStream: AsyncIterable<any>;
    try {
      responseStream = await this.client.models.generateContentStream({
        model: req.modelKey,
        contents,
        config,
      });
    } catch (err) {
      throw normalizeGeminiError(err);
    }

    try {
      for await (const chunk of responseStream) {
        if (req.signal?.aborted) {
          throw new Error("AbortError");
        }

        const candidate = chunk.candidates?.[0];

        // 1. Check parts for thoughts, text, and tool calls
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.thought === true) {
              const text = part.text || "";
              outputCharCount += text.length;
              yield { type: "thought_delta", text };
            } else if (part.text) {
              outputCharCount += part.text.length;
              yield { type: "text_delta", text: part.text };
            }

            if (part.functionCall) {
              yield {
                type: "tool_call",
                name: part.functionCall.name,
                args: part.functionCall.args,
              };
            }
          }
        }

        // 2. Check grounding metadata for citations
        const groundingChunks =
          candidate?.groundingMetadata?.groundingChunks || [];
        for (const gc of groundingChunks) {
          if (gc.web?.uri) {
            yield {
              type: "citation",
              url: gc.web.uri,
              title: gc.web.title,
            };
          }
        }

        // 3. Map finish reason
        if (candidate?.finishReason) {
          const rawReason = String(candidate.finishReason).toUpperCase();
          if (rawReason.includes("SAFETY")) {
            throw normalizeGeminiError(new Error("SAFETY: Content flagged"));
          } else if (rawReason.includes("MAX_TOKENS") || rawReason.includes("LENGTH")) {
            finishReason = "length";
          } else if (rawReason.includes("TOOL")) {
            finishReason = "tool";
          } else {
            finishReason = "stop";
          }
        }

        // 4. Handle token usage metadata
        if (chunk.usageMetadata) {
          emittedUsage = true;
          const inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          const outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
          const thoughtTokens = chunk.usageMetadata.thoughtsTokenCount ?? 0;

          yield {
            type: "usage",
            inputTokens,
            outputTokens,
            thoughtTokens,
            estimated: false,
          };
        }
      }
    } catch (err) {
      throw normalizeGeminiError(err);
    }

    // If usageMetadata was missing from all chunks, emit estimated usage
    if (!emittedUsage) {
      yield {
        type: "usage",
        inputTokens: Math.max(1, Math.ceil(inputCharCount / 4)),
        outputTokens: Math.max(1, Math.ceil(outputCharCount / 4)),
        estimated: true,
      };
    }

    yield {
      type: "done",
      finishReason,
    };
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    try {
      const response = await this.client.models.generateImages({
        model: req.modelKey,
        prompt: req.prompt,
        config: {
          numberOfImages: req.numberOfImages ?? 1,
          aspectRatio: req.aspectRatio ?? "1:1",
          outputMimeType: "image/png",
        },
      });

      const generated = response.generatedImages?.[0];
      const base64Bytes = generated?.image?.imageBytes;

      if (!base64Bytes) {
        throw new Error("No image bytes returned by the model");
      }

      const bytes = Buffer.from(base64Bytes, "base64");
      return {
        bytes,
        mime: "image/png",
        usage: { images: req.numberOfImages ?? 1 },
      };
    } catch (err) {
      throw normalizeGeminiError(err);
    }
  }
}
