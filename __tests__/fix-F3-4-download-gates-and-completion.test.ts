/**
 * @jest-environment jsdom
 */

import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { exportFormatGateReason } from "@/lib/entitlements/shared";
import {
  insertCompletedResponse,
  type PaginatedResponses,
} from "@/lib/api/hooks/responses";
import { queryKeys } from "@/lib/api/hooks/query-keys";

describe("F3.4 — download formats follow the workspace owner's plan", () => {
  const base = { exportCapabilityLabel: "export this document" };

  it("allows a format the owner's plan includes, whatever the viewer's plan", () => {
    expect(
      exportFormatGateReason({
        ...base,
        format: "pdf",
        ownerFormats: ["md", "pdf", "docx"],
        isOwner: false,
        canExport: true,
      })
    ).toBeNull();
  });

  it("tells a member it's the owner's plan (no upgrade link), and the owner to upgrade", () => {
    const args = { ...base, format: "docx" as const, ownerFormats: ["md"], canExport: true };
    expect(exportFormatGateReason({ ...args, isOwner: false })).toEqual({
      code: "owner_plan",
      plan: "LITE",
    });
    expect(exportFormatGateReason({ ...args, isOwner: true })).toEqual({
      code: "requires_plan",
      plan: "LITE",
    });
  });

  it("needs the export permission for Word / PDF, and for Markdown only when asked", () => {
    const args = { ...base, ownerFormats: ["md", "pdf", "docx"], isOwner: false, canExport: false };
    expect(exportFormatGateReason({ ...args, format: "pdf" })?.code).toBe("no_permission");
    expect(exportFormatGateReason({ ...args, format: "md" })).toBeNull();
    expect(
      exportFormatGateReason({ ...args, format: "md", markdownNeedsExport: true })?.code
    ).toBe("no_permission");
  });

  it("doesn't grey anything out while the owner's formats are loading", () => {
    expect(
      exportFormatGateReason({
        ...base,
        format: "docx",
        ownerFormats: undefined,
        isOwner: false,
        canExport: true,
      })
    ).toBeNull();
  });
});

describe("F3.4 — the finished answer goes into the list with its documents", () => {
  const userId = "u1";
  const workspaceId = "ws1";
  const key = [...queryKeys.responses.all(userId, workspaceId), { view: "edited" }];

  function seed(client: QueryClient, nextCursor: string | null) {
    client.setQueryData<InfiniteData<PaginatedResponses>>(key, {
      pages: [
        {
          items: [
            {
              id: "r0",
              chatId: workspaceId,
              prompt: "Earlier",
              response: "Earlier answer",
              createdAt: "2026-11-13T00:00:00.000Z",
              updatedAt: "2026-11-13T00:00:00.000Z",
            },
          ],
          nextCursor,
        },
      ],
      pageParams: [undefined],
    });
  }

  const done = {
    responseId: "r1",
    versionId: "v1",
    prompt: "Write a PRD as a Word document",
    content: "Here is the PRD.",
    citations: [],
    documents: [{ id: "d1", title: "PRD", format: "docx", currentRevision: 1 }],
  };

  it("appends the answer with its document cards at once", () => {
    const client = new QueryClient();
    seed(client, null);
    insertCompletedResponse(client, userId, workspaceId, done);

    const data = client.getQueryData<InfiniteData<PaginatedResponses>>(key)!;
    const items = data.pages[0]!.items;
    expect(items.map((r) => r.id)).toEqual(["r0", "r1"]);
    expect(items[1]!.activeVersion?.documents).toEqual(done.documents);
    expect(items[1]!.activeVersion?.content).toBe("Here is the PRD.");
  });

  it("does nothing twice, nor when later pages aren't loaded", () => {
    const client = new QueryClient();
    seed(client, null);
    insertCompletedResponse(client, userId, workspaceId, done);
    insertCompletedResponse(client, userId, workspaceId, done);
    expect(
      client.getQueryData<InfiniteData<PaginatedResponses>>(key)!.pages[0]!.items
    ).toHaveLength(2);

    const partial = new QueryClient();
    seed(partial, "cursor-2");
    insertCompletedResponse(partial, userId, workspaceId, done);
    expect(
      partial.getQueryData<InfiniteData<PaginatedResponses>>(key)!.pages[0]!.items
    ).toHaveLength(1);
  });
});
