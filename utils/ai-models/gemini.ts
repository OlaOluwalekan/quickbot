import { GoogleGenAI } from "@google/genai";
import ActionResponse from "../response";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface StreamInteractionEvent {
  type: "delta" | "completed";
  text?: string;
  fullText?: string;
  interactionId?: string;
  tokenCount?: number;
}

/**
 * Counts the number of tokens used in a given prompt using the Gemini model.
 *
 * @param {string} prompt - The input string for which the token count is to be calculated.
 * @returns {Promise<ActionResponse<any>>}
 */
export const countGeminiTokensUsed = async (
  prompt: string
): Promise<ActionResponse<any>> => {
  try {
    const ai = getAIClient();
    const res = await ai.models.countTokens({
      model: TEXT_MODEL,
      contents: prompt,
    });
    return ActionResponse.success("Counted tokens", {
      tokenCount: res.totalTokens ?? Math.ceil(prompt.length / 4),
    });
  } catch (error) {
    console.error("[Gemini] Error counting tokens:", error);
    return ActionResponse.success("Estimated tokens", {
      tokenCount: Math.max(1, Math.ceil(prompt.length / 4)),
    });
  }
};

/**
 * Generates a single-turn text response using Google's Interactions API (`ai.interactions.create`).
 *
 * @param {string} prompt - The input prompt string.
 * @returns {Promise<ActionResponse<any>>}
 */
export const getGeminiResponse = async (
  prompt: string
): Promise<ActionResponse<any>> => {
  try {
    const ai = getAIClient();
    const interaction = await ai.interactions.create({
      model: TEXT_MODEL,
      input: prompt,
    });

    const text = (interaction.output_text || "").trim();
    const tokenCount =
      interaction.usage?.total_tokens ??
      (interaction.usage?.total_input_tokens ?? 0) +
        (interaction.usage?.total_output_tokens ?? 0);

    return ActionResponse.success("responded", {
      text,
      interactionId: interaction.id,
      tokenCount: tokenCount || Math.max(1, Math.ceil(text.length / 4)),
    });
  } catch (error) {
    console.error("[Gemini] getGeminiResponse error:", error);
    return ActionResponse.error("failed to respond", null);
  }
};

/**
 * Builds contextual input string if previous_interaction_id is not available
 * (e.g., for legacy chat turns created prior to Interactions API migration).
 */
function buildInputWithLegacyHistory(
  prompt: string,
  history: any[] = []
): string {
  if (!history || history.length === 0) {
    return prompt;
  }

  const formattedTurns = history
    .map((item) => {
      if (item.question && item.response) {
        return `User: ${item.question}\nAssistant: ${item.response}`;
      }
      const role = item.role === "model" ? "Assistant" : "User";
      const text =
        item.parts?.map((p: any) => p.text).join(" ") || item.text || "";
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return formattedTurns
    ? `Previous conversation context:\n${formattedTurns}\n\nUser: ${prompt}`
    : prompt;
}

/**
 * Generates a multi-turn chat response using Google's Interactions API (`ai.interactions.create`).
 * Uses `previous_interaction_id` when available, or falls back to formatted conversation context.
 *
 * @param {string} prompt - User message prompt.
 * @param {any[]} history - Legacy chat history array.
 * @param {string} [previousInteractionId] - Optional previous Gemini interaction ID.
 * @returns {Promise<ActionResponse<any>>}
 */
export const getGeminiChatResponse = async (
  prompt: string,
  history: any[] = [],
  previousInteractionId?: string | null
): Promise<ActionResponse<any>> => {
  try {
    const ai = getAIClient();
    const input = previousInteractionId
      ? prompt
      : buildInputWithLegacyHistory(prompt, history);

    const interaction = await ai.interactions.create({
      model: TEXT_MODEL,
      input,
      ...(previousInteractionId
        ? { previous_interaction_id: previousInteractionId }
        : {}),
    });

    const text = interaction.output_text || "";
    const usage = interaction.usage;
    const tokenCount =
      usage?.total_tokens ??
      ((usage?.total_input_tokens ?? 0) + (usage?.total_output_tokens ?? 0) ||
        Math.max(1, Math.ceil((prompt.length + text.length) / 4)));

    return ActionResponse.success("responded", {
      text,
      tokenCount,
      interactionId: interaction.id,
    });
  } catch (error) {
    console.error("[Gemini] getGeminiChatResponse error:", error);
    return ActionResponse.error("failed to respond", null);
  }
};

/**
 * Streams a multi-turn chat response using Google's Interactions API (`ai.interactions.create` with `stream: true`).
 * Yields incremental text deltas (`step.delta`) and a final completion event (`interaction.completed`).
 *
 * @param {string} prompt - User message prompt.
 * @param {string | null} [previousInteractionId] - Optional previous Gemini interaction ID for stateful multi-turn context.
 * @param {Array<{ question: string; response: string }>} [historyFallback] - Fallback history if no previousInteractionId exists.
 */
export async function* streamGeminiInteraction(
  prompt: string,
  previousInteractionId?: string | null,
  historyFallback: Array<{ question: string; response: string }> = []
): AsyncGenerator<StreamInteractionEvent, void, unknown> {
  const ai = getAIClient();
  const input = previousInteractionId
    ? prompt
    : buildInputWithLegacyHistory(prompt, historyFallback);

  const stream = await ai.interactions.create({
    model: TEXT_MODEL,
    input,
    ...(previousInteractionId
      ? { previous_interaction_id: previousInteractionId }
      : {}),
    stream: true,
  });

  let fullText = "";
  let interactionId = "";
  let tokenCount = 0;

  for await (const event of stream) {
    if (event.event_type === "interaction.created") {
      if (event.interaction?.id) {
        interactionId = event.interaction.id;
      }
    } else if (event.event_type === "step.delta") {
      const delta = event.delta as any;
      if (delta?.type === "text" && typeof delta.text === "string") {
        fullText += delta.text;
        yield {
          type: "delta",
          text: delta.text,
        };
      }
      if (event.metadata?.total_usage?.total_tokens) {
        tokenCount = event.metadata.total_usage.total_tokens;
      }
    } else if (event.event_type === "interaction.completed") {
      if (event.interaction?.id) {
        interactionId = event.interaction.id;
      }
      const usage = event.interaction?.usage;
      if (usage) {
        tokenCount =
          usage.total_tokens ??
          (usage.total_input_tokens ?? 0) + (usage.total_output_tokens ?? 0);
      }
    } else if (event.event_type === "error") {
      const errMsg =
        (event as any).error?.message || "Gemini streaming interaction error";
      throw new Error(errMsg);
    }
  }

  if (!tokenCount) {
    tokenCount = Math.max(1, Math.ceil((prompt.length + fullText.length) / 4));
  }

  yield {
    type: "completed",
    fullText,
    interactionId,
    tokenCount,
  };
}

/**
 * Generates an image using Google's Interactions API (`ai.interactions.create`) with the Nano Banana image model.
 *
 * @param {string} prompt - The image description prompt.
 * @param {string | null} [previousInteractionId] - Optional previous interaction ID.
 * @returns {Promise<ActionResponse<any>>}
 */
export const generateGeminiImage = async (
  prompt: string,
  previousInteractionId?: string | null
): Promise<ActionResponse<any>> => {
  try {
    const ai = getAIClient();
    const interaction = await ai.interactions.create({
      model: IMAGE_MODEL,
      input: prompt,
      ...(previousInteractionId
        ? { previous_interaction_id: previousInteractionId }
        : {}),
    });

    let base64Data = interaction.output_image?.data;
    let mimeType = interaction.output_image?.mime_type || "image/png";
    let imageUri = interaction.output_image?.uri;

    // Also inspect interaction steps in case image content is nested in a model output step
    if (!base64Data && !imageUri && Array.isArray(interaction.steps)) {
      for (const step of interaction.steps as any[]) {
        const contents = step?.content || step?.outputs || [];
        const items = Array.isArray(contents) ? contents : [contents];
        for (const item of items) {
          if (item?.type === "image" && (item.data || item.uri)) {
            base64Data = item.data;
            mimeType = item.mime_type || mimeType;
            imageUri = item.uri;
            break;
          }
        }
      }
    }

    if (!base64Data && !imageUri) {
      return ActionResponse.error(
        "No image was returned by the model. Try refining your prompt.",
        null
      );
    }

    const imageUrl = base64Data
      ? `data:${mimeType};base64,${base64Data}`
      : (imageUri as string);

    const caption =
      interaction.output_text?.trim() || `Generated image for: "${prompt}"`;

    const usage = interaction.usage;
    const tokenCount =
      usage?.total_tokens ??
      ((usage?.total_input_tokens ?? 0) + (usage?.total_output_tokens ?? 0) ||
        250);

    return ActionResponse.success("Generated image", {
      imageUrl,
      mimeType,
      caption,
      interactionId: interaction.id,
      tokenCount,
    });
  } catch (error) {
    console.error("[Gemini] generateGeminiImage error:", error);
    return ActionResponse.error(
      error instanceof Error ? error.message : "Failed to generate image",
      null
    );
  }
};

const DEFAULT_TEMPLATE_PROMPTS = [
  {
    category: "Architecture",
    prompt: "Design a scalable microservices architecture for a real-time fintech platform",
  },
  {
    category: "Creative Studio",
    prompt: "Generate a futuristic cyberpunk cityscape drenched in neon rain at dusk",
  },
  {
    category: "Productivity",
    prompt: "Create a 30-day high-leverage learning roadmap for mastering system design",
  },
  {
    category: "Code Review",
    prompt: "Explain how Server-Sent Events compare to WebSockets with TypeScript examples",
  },
];

/**
 * Generates a structured JSON array of template prompts using Google's Interactions API.
 *
 * @param {string} prompt - Prompt instructing the model to generate JSON items.
 * @returns {Promise<ActionResponse<any>>}
 */
export const getGeminiJSONResponse = async (
  prompt: string
): Promise<ActionResponse<any>> => {
  try {
    const ai = getAIClient();
    const interaction = await ai.interactions.create({
      model: TEXT_MODEL,
      input: `${prompt}. Respond ONLY with a valid JSON array of objects, each containing "category" (string) and "prompt" (string) keys.`,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "template_prompts",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                prompt: { type: "string" },
              },
              required: ["category", "prompt"],
            },
          },
        },
      } as any,
    });

    const rawText = (interaction.output_text || "").trim();
    if (!rawText) {
      return ActionResponse.success("responded", {
        result: JSON.stringify(DEFAULT_TEMPLATE_PROMPTS),
      });
    }

    return ActionResponse.success("responded", {
      result: rawText,
    });
  } catch (error) {
    console.error("[Gemini] getGeminiJSONResponse error, using fallback:", error);
    return ActionResponse.success("responded", {
      result: JSON.stringify(DEFAULT_TEMPLATE_PROMPTS),
    });
  }
};
