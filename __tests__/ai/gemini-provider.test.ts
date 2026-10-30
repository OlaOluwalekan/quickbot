/**
 * @jest-environment node
 */
import { GeminiProvider } from "@/server/ai/providers/gemini";
import { GenerateRequest, ImageRequest, StreamEvent } from "@/server/ai/types";

describe("Step 2.1 — Gemini Provider Event & Image Mapping", () => {
  it("maps thoughts, text deltas, tool calls, citations, and usage events", async () => {
    // Mock response chunks from GoogleGenAI generateContentStream
    const mockChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: "Let me ponder this step-by-step..." }],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [{ text: "Hello! " }],
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: "https://example.com/source", title: "Example Source" } },
              ],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [
                { text: "Here is your answer." },
                {
                  functionCall: {
                    name: "lookup_data",
                    args: { query: "finance" },
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 25,
          thoughtsTokenCount: 10,
        },
      },
    ];

    async function* generateMockStream() {
      for (const chunk of mockChunks) {
        yield chunk;
      }
    }

    const mockClient = {
      models: {
        generateContentStream: jest.fn().mockResolvedValue(generateMockStream()),
        generateImages: jest.fn(),
      },
    } as any;

    const provider = new GeminiProvider(mockClient);

    const req: GenerateRequest = {
      modelKey: "gemini-2.5-flash",
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "Can you help me?" }],
        },
      ],
      system: "You are a helpful assistant.",
      grounding: true,
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.stream(req)) {
      events.push(event);
    }

    // 1. Verify thought_delta
    const thoughtEvents = events.filter((e) => e.type === "thought_delta");
    expect(thoughtEvents.length).toBe(1);
    expect((thoughtEvents[0] as any).text).toBe("Let me ponder this step-by-step...");

    // 2. Verify text_delta
    const textEvents = events.filter((e) => e.type === "text_delta");
    expect(textEvents.length).toBe(2);
    expect((textEvents[0] as any).text).toBe("Hello! ");
    expect((textEvents[1] as any).text).toBe("Here is your answer.");

    // 3. Verify tool_call
    const toolEvents = events.filter((e) => e.type === "tool_call");
    expect(toolEvents.length).toBe(1);
    expect((toolEvents[0] as any).name).toBe("lookup_data");
    expect((toolEvents[0] as any).args).toEqual({ query: "finance" });

    // 4. Verify citation
    const citationEvents = events.filter((e) => e.type === "citation");
    expect(citationEvents.length).toBe(1);
    expect((citationEvents[0] as any).url).toBe("https://example.com/source");

    // 5. Verify usage
    const usageEvents = events.filter((e) => e.type === "usage");
    expect(usageEvents.length).toBe(1);
    expect((usageEvents[0] as any).inputTokens).toBe(15);
    expect((usageEvents[0] as any).outputTokens).toBe(25);
    expect((usageEvents[0] as any).thoughtTokens).toBe(10);
    expect((usageEvents[0] as any).estimated).toBe(false);

    // 6. Verify done
    const doneEvents = events.filter((e) => e.type === "done");
    expect(doneEvents.length).toBe(1);
    expect((doneEvents[0] as any).finishReason).toBe("stop");
  });

  it("falls back to estimated usage when usageMetadata is missing", async () => {
    const mockChunks = [
      {
        candidates: [
          {
            content: {
              parts: [{ text: "Short response." }],
            },
            finishReason: "STOP",
          },
        ],
      },
    ];

    async function* generateMockStream() {
      for (const chunk of mockChunks) {
        yield chunk;
      }
    }

    const mockClient = {
      models: {
        generateContentStream: jest.fn().mockResolvedValue(generateMockStream()),
      },
    } as any;

    const provider = new GeminiProvider(mockClient);

    const req: GenerateRequest = {
      modelKey: "gemini-2.5-flash",
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.stream(req)) {
      events.push(event);
    }

    const usage = events.find((e) => e.type === "usage") as any;
    expect(usage).toBeDefined();
    expect(usage.estimated).toBe(true);
    expect(usage.inputTokens).toBeGreaterThanOrEqual(1);
    expect(usage.outputTokens).toBeGreaterThanOrEqual(1);
  });

  it("generateImage returns a Buffer, mime type, and usage metadata", async () => {
    const dummyBase64 = Buffer.from("fake-png-image-binary-data").toString("base64");

    const mockClient = {
      models: {
        generateImages: jest.fn().mockResolvedValue({
          generatedImages: [
            {
              image: {
                imageBytes: dummyBase64,
              },
            },
          ],
        }),
      },
    } as any;

    const provider = new GeminiProvider(mockClient);

    const req: ImageRequest = {
      modelKey: "imagen-3.0-generate-002",
      prompt: "A beautiful mountain at sunrise",
      aspectRatio: "16:9",
      numberOfImages: 1,
    };

    const result = await provider.generateImage(req);

    expect(result).toBeDefined();
    expect(Buffer.isBuffer(result.bytes)).toBe(true);
    expect(result.bytes.toString()).toBe("fake-png-image-binary-data");
    expect(result.mime).toBe("image/png");
    expect(result.usage?.images).toBe(1);
  });
});
