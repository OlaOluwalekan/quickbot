/**
 * @jest-environment node
 *
 * F4.4b — thought signatures on tool calls. Thinking models need the
 * signature of their own function call sent back, unchanged, on the same
 * part when the call is replayed in the next request.
 */
import type { GoogleGenAI } from "@google/genai";
import { GeminiProvider, MISSING_THOUGHT_SIGNATURE } from "@/server/ai/providers/gemini";
import type { GenerateRequest, StreamEvent } from "@/server/ai/types";

function clientStreaming(chunks: unknown[]) {
  const generateContentStream = jest.fn().mockResolvedValue(
    (async function* () {
      for (const c of chunks) yield c;
    })()
  );
  const client = { models: { generateContentStream } } as unknown as GoogleGenAI;
  return { client, generateContentStream };
}

const chunk = (parts: unknown[]) => ({ candidates: [{ content: { parts } }] });

async function collect(provider: GeminiProvider, req: GenerateRequest) {
  const events: StreamEvent[] = [];
  for await (const e of provider.stream(req)) events.push(e);
  return events;
}

const baseReq = (messages: GenerateRequest["messages"]): GenerateRequest => ({
  modelKey: "test-model",
  messages,
});

describe("F4.4b — thought signatures on tool calls", () => {
  it("a signature on the functionCall part is attached to the tool_call event", async () => {
    const { client } = clientStreaming([
      chunk([{ functionCall: { name: "web_search", args: { q: "x" } }, thoughtSignature: "sig_A" }]),
    ]);
    const events = await collect(
      new GeminiProvider(client),
      baseReq([{ role: "user", parts: [{ type: "text", text: "hi" }] }])
    );

    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      name: "web_search",
      thoughtSignature: "sig_A",
    });
  });

  it("a signature from another part is never moved onto the call", async () => {
    const { client } = clientStreaming([
      chunk([{ text: "thinking…", thought: true, thoughtSignature: "sig_text" }]),
      chunk([{ functionCall: { name: "web_search", args: {} } }]),
    ]);
    const events = await collect(
      new GeminiProvider(client),
      baseReq([{ role: "user", parts: [{ type: "text", text: "hi" }] }])
    );

    const call = events.find((e) => e.type === "tool_call");
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty("thoughtSignature", "sig_text");
    expect((call as { thoughtSignature?: string }).thoughtSignature).toBeUndefined();
  });

  it("parallel calls: only the first carries the signature", async () => {
    const { client } = clientStreaming([
      chunk([
        { functionCall: { name: "web_search", args: { q: "a" } }, thoughtSignature: "sig_A" },
        { functionCall: { name: "web_search", args: { q: "b" } } },
      ]),
    ]);
    const events = await collect(
      new GeminiProvider(client),
      baseReq([{ role: "user", parts: [{ type: "text", text: "hi" }] }])
    );

    const calls = events.filter((e) => e.type === "tool_call");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ thoughtSignature: "sig_A" });
    expect((calls[1] as { thoughtSignature?: string }).thoughtSignature).toBeUndefined();
  });

  it("a replayed call sends its captured signature back unchanged, beside functionCall", async () => {
    const { client, generateContentStream } = clientStreaming([chunk([{ text: "done" }])]);
    await collect(
      new GeminiProvider(client),
      baseReq([
        { role: "user", parts: [{ type: "text", text: "hi" }] },
        {
          role: "assistant",
          parts: [{ type: "tool_call", name: "web_search", args: { q: "x" }, thoughtSignature: "sig_A" }],
        },
        {
          role: "user",
          parts: [{ type: "tool_response", name: "web_search", response: { results: [] } }],
        },
      ])
    );

    const contents = generateContentStream.mock.calls[0][0].contents;
    expect(contents[1]).toEqual({
      role: "model",
      parts: [{ functionCall: { name: "web_search", args: { q: "x" } }, thoughtSignature: "sig_A" }],
    });
  });

  it("a replayed call without a signature gets the documented dummy value", async () => {
    const { client, generateContentStream } = clientStreaming([chunk([{ text: "done" }])]);
    await collect(
      new GeminiProvider(client),
      baseReq([
        { role: "user", parts: [{ type: "text", text: "hi" }] },
        { role: "assistant", parts: [{ type: "tool_call", name: "web_search", args: {} }] },
      ])
    );

    const replayed = generateContentStream.mock.calls[0][0].contents[1].parts[0];
    expect(MISSING_THOUGHT_SIGNATURE).toBe("skip_thought_signature_validator");
    expect(replayed.thoughtSignature).toBe(MISSING_THOUGHT_SIGNATURE);
  });
});
