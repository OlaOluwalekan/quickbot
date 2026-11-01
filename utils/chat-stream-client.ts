import { useUiStore } from "@/lib/stores/ui";
import { useGenerationStore } from "@/lib/stores/generation";
import { toast } from "sonner";

interface SubmitPromptOptions {
  prompt: string;
  chatId?: string | null;
  mode: "text" | "image";
  onNavigateChat: (chatId: string) => void;
  onRefresh: () => void;
}

/**
 * Parses Server-Sent Events blocks (`event: ...\ndata: ...\n\n`) from a text buffer.
 */
function parseSSEBlocks(buffer: string): {
  events: Array<{ event: string; data: any }>;
  remaining: string;
} {
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() || "";
  const events: Array<{ event: string; data: any }> = [];

  for (const block of parts) {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      const rawData = dataLines.join("\n");
      try {
        events.push({ event: eventName, data: JSON.parse(rawData) });
      } catch {
        events.push({ event: eventName, data: rawData });
      }
    }
  }

  return { events, remaining };
}

/**
 * Sends a prompt via either `/api/chat/stream` (SSE text streaming) or `/api/chat/image` (Nano Banana image synthesis).
 */
export async function submitChatPrompt({
  prompt,
  chatId,
  mode,
  onNavigateChat,
  onRefresh,
}: SubmitPromptOptions): Promise<void> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) return;

  const streamKey = chatId || "__new__";
  const genStore = useGenerationStore.getState();
  const uiStore = useUiStore.getState();

  genStore.startStream(streamKey, { prompt: cleanPrompt });

  let resolvedChatId = chatId || "";
  const wasNewChat = !resolvedChatId;

  try {
    if (mode === "image") {
      const res = await fetch("/api/chat/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          chatId: resolvedChatId || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to generate image");
      }

      const { response: savedResponse, chatId: newChatId } = json.data || {};
      if (savedResponse) {
        useUiStore.getState().addOptimisticResponse(savedResponse);
      }

      useGenerationStore.getState().resetStream(streamKey);

      if (wasNewChat && newChatId) {
        onNavigateChat(newChatId);
      } else {
        onRefresh();
      }
      return;
    }

    // Text mode: stream via Server-Sent Events from POST /api/chat/stream
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: cleanPrompt,
        chatId: resolvedChatId || undefined,
      }),
    });

    if (!response.ok || !response.body) {
      let errMsg = "Failed to stream AI response";
      try {
        const errJson = await response.json();
        errMsg = errJson.message || errMsg;
      } catch {
        // ignore JSON parse error
      }
      throw new Error(errMsg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = parseSSEBlocks(buffer);
      buffer = remaining;

      for (const evt of events) {
        if (evt.event === "chat_created") {
          resolvedChatId = evt.data?.chatId || resolvedChatId;
          if (evt.data?.title) {
            uiStore.setCurrentPageTitle(evt.data.title);
          }
          if (resolvedChatId) {
            uiStore.setCurrentPageId(resolvedChatId);
          }
        } else if (evt.event === "delta") {
          if (evt.data?.text) {
            useGenerationStore.getState().appendDelta(streamKey, evt.data.text);
          }
        } else if (evt.event === "completed") {
          const savedResponse = evt.data?.response;
          resolvedChatId = evt.data?.chatId || resolvedChatId;

          if (savedResponse) {
            useUiStore.getState().addOptimisticResponse(savedResponse);
          }

          useGenerationStore.getState().resetStream(streamKey);

          if (wasNewChat && resolvedChatId) {
            onNavigateChat(resolvedChatId);
          } else {
            onRefresh();
          }
        } else if (evt.event === "error") {
          throw new Error(evt.data?.message || "Streaming error occurred");
        }
      }
    }
  } catch (error: any) {
    console.error("[submitChatPrompt] Error:", error);
    toast.error(error instanceof Error ? error.message : "Failed to respond");
  } finally {
    useGenerationStore.getState().resetStream(streamKey);
  }
}
