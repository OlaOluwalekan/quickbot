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

export const GEMINI_SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_LOW_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
] as const;

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
        if (p.type === "tool_call") {
          const callPart: Record<string, unknown> = {
            functionCall: {
              name: p.name,
              args: (p.args as Record<string, unknown>) || {},
            },
          };
          if (p.thoughtSignature) {
            callPart.thoughtSignature = p.thoughtSignature;
            callPart.thought_signature = p.thoughtSignature;
          }
          return callPart;
        }
        if (p.type === "tool_response") {
          return {
            functionResponse: {
              name: p.name,
              response:
                typeof p.response === "object" && p.response !== null
                  ? (p.response as Record<string, unknown>)
                  : { result: p.response },
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
      safetySettings: GEMINI_SAFETY_SETTINGS,
    };

    if (req.thinking?.summaries !== false && !req.responseSchema) {
      config.thinkingConfig = {
        includeThoughts: true,
      };
    }

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
      config.responseMimeType = "application/json";
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

    let latestThoughtSignature: string | undefined;

    try {
      for await (const chunk of responseStream) {
        if (req.signal?.aborted) {
          throw new Error("AbortError");
        }

        const candidate = chunk.candidates?.[0];

        const chunkCandidateSig =
          (candidate as any)?.thoughtSignature ||
          (candidate as any)?.thought_signature ||
          (chunk as any)?.thoughtSignature ||
          (chunk as any)?.thought_signature;

        if (chunkCandidateSig && !latestThoughtSignature) {
          latestThoughtSignature = chunkCandidateSig;
          yield { type: "thought_signature", signature: chunkCandidateSig };
        }

        // 1. Check parts for thoughts, text, and tool calls
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            const partSig =
              (part as any).thoughtSignature ||
              (part as any).thought_signature ||
              (part.functionCall as any)?.thoughtSignature ||
              (part.functionCall as any)?.thought_signature;

            if (partSig) {
              latestThoughtSignature = partSig;
              yield { type: "thought_signature", signature: partSig };
            }

            if (part.thought === true) {
              const text = part.text || "";
              outputCharCount += text.length;
              yield { type: "thought_delta", text };
            } else if (part.text) {
              outputCharCount += part.text.length;
              yield { type: "text_delta", text: part.text };
            }

            if (part.functionCall) {
              const toolSig = partSig || latestThoughtSignature;
              yield {
                type: "tool_call",
                name: part.functionCall.name,
                args: part.functionCall.args,
                thoughtSignature: toolSig,
              };
            }
          }
        }

        // 2. Check grounding metadata (groundingChunks + groundingSupports) for citations
        const groundingMetadata = candidate?.groundingMetadata;
        const groundingChunks: Array<{ web?: { uri?: string; title?: string } }> =
          groundingMetadata?.groundingChunks || [];
        const groundingSupports: Array<{
          segment?: { startIndex?: number; endIndex?: number; text?: string };
          groundingChunkIndices?: number[];
        }> = groundingMetadata?.groundingSupports || [];

        for (let chunkIdx = 0; chunkIdx < groundingChunks.length; chunkIdx++) {
          const gc = groundingChunks[chunkIdx];
          if (gc?.web?.uri) {
            // Collect any segments and snippet text that reference this chunk index
            const matchingSupports = groundingSupports.filter(
              (sup) =>
                Array.isArray(sup.groundingChunkIndices) &&
                sup.groundingChunkIndices.includes(chunkIdx)
            );
            const segments = matchingSupports
              .map((sup) => sup.segment)
              .filter(
                (seg): seg is { startIndex?: number; endIndex?: number; text?: string } =>
                  Boolean(seg)
              );
            const snippet = segments
              .map((seg) => seg.text?.trim())
              .filter(Boolean)
              .join(" … ") || undefined;

            yield {
              type: "citation",
              url: gc.web.uri,
              title: gc.web.title,
              ...(snippet ? { snippet } : {}),
              ...(segments.length > 0 ? { segments } : {}),
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
      const isImagenModel = /^imagen/i.test(req.modelKey);

      if (
        !isImagenModel &&
        typeof this.client.models?.generateContent === "function"
      ) {
        const response = await this.client.models.generateContent({
          model: req.modelKey,
          contents: req.prompt,
          config: {
            responseModalities: ["IMAGE"],
            safetySettings: GEMINI_SAFETY_SETTINGS as any,
          },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const imgPart = parts.find((p: any) => p?.inlineData?.data);
        const base64Bytes = imgPart?.inlineData?.data;
        const rawMime = imgPart?.inlineData?.mimeType || "image/png";
        const mime: "image/png" | "image/jpeg" | "image/webp" =
          rawMime === "image/jpeg" || rawMime === "image/jpg"
            ? "image/jpeg"
            : rawMime === "image/webp"
              ? "image/webp"
              : "image/png";

        if (!base64Bytes) {
          const finishReason = response.candidates?.[0]?.finishReason;
          if (
            finishReason &&
            String(finishReason).toUpperCase().includes("SAFETY")
          ) {
            throw new Error("SAFETY: Image generation blocked by safety filter");
          }
          throw new Error("No image bytes returned by the model");
        }

        const bytes = Buffer.from(base64Bytes, "base64");
        return {
          bytes,
          mime,
          usage: { images: req.numberOfImages ?? 1 },
        };
      }

      const response = await this.client.models.generateImages({
        model: req.modelKey,
        prompt: req.prompt,
        config: {
          numberOfImages: req.numberOfImages ?? 1,
          aspectRatio: req.aspectRatio ?? "1:1",
          outputMimeType: "image/png",
          safetyFilterLevel: "BLOCK_LOW_AND_ABOVE" as any,
          personGeneration: "ALLOW_ADULT" as any,
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
