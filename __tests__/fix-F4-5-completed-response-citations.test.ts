/**
 * Web-search sources after an answer finishes (found while reviewing F4.5).
 * If the response list or the response's versions were cached while the
 * answer was still streaming, the finished card showed no sources and its
 * [n] markers as plain text until a page reload.
 */
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  insertCompletedResponse,
  type PaginatedResponses,
  type ResponseItemDto,
} from "@/lib/api/hooks/responses";
import { queryKeys } from "@/lib/api/hooks/query-keys";

const userId = "u1";
const workspaceId = "w1";
const listKey = [...queryKeys.responses.all(userId, workspaceId), { limit: 50 }];

const citation = {
  index: 1,
  url: "https://example.com/a",
  title: "A",
  source: "GROUNDING",
};

const done = {
  responseId: "r1",
  versionId: "v1",
  prompt: "What's new?",
  content: "Fresh news [1].",
  citations: [citation],
  documents: [],
};

/** The response as the list returned it mid-stream: no text, no sources. */
const streaming = {
  id: "r1",
  chatId: workspaceId,
  prompt: "What's new?",
  origin: "DIRECT",
  response: "",
  activeVersionId: null,
  activeVersion: {
    id: "v1",
    responseId: "r1",
    number: 1,
    status: "STREAMING",
    content: "",
    originalContent: "",
    citations: [],
    documents: [],
    createdAt: "2026-11-15T10:00:00.000Z",
  },
  versionCount: 1,
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
} as unknown as ResponseItemDto;

function seed(client: QueryClient, items: ResponseItemDto[]) {
  client.setQueryData<InfiniteData<PaginatedResponses>>(listKey, {
    pages: [{ items, nextCursor: null }],
    pageParams: [undefined],
  });
}

describe("finished answer keeps its web-search sources", () => {
  it("fills in a response that was cached while streaming", () => {
    const client = new QueryClient();
    seed(client, [streaming]);

    insertCompletedResponse(client, userId, workspaceId, done);

    const item = client.getQueryData<InfiniteData<PaginatedResponses>>(listKey)!.pages[0]!
      .items[0]!;
    expect(item.activeVersionId).toBe("v1");
    expect(item.activeVersion?.content).toBe("Fresh news [1].");
    expect(item.activeVersion?.citations).toEqual([citation]);
  });

  it("drops the versions cached for that response so the card reloads them", async () => {
    const client = new QueryClient();
    seed(client, [streaming]);
    const versionsKey = queryKeys.responses.versions(userId, "r1");
    client.setQueryData(versionsKey, [streaming.activeVersion]);

    insertCompletedResponse(client, userId, workspaceId, done);

    expect(client.getQueryState(versionsKey)?.isInvalidated).toBe(true);
  });

  it("leaves a response alone when another version is active", () => {
    const client = new QueryClient();
    const other = {
      ...streaming,
      activeVersionId: "v0",
      activeVersion: { ...streaming.activeVersion!, id: "v0", content: "Old" },
    } as ResponseItemDto;
    seed(client, [other]);

    insertCompletedResponse(client, userId, workspaceId, done);

    const item = client.getQueryData<InfiniteData<PaginatedResponses>>(listKey)!.pages[0]!
      .items[0]!;
    expect(item.activeVersion?.content).toBe("Old");
  });
});
