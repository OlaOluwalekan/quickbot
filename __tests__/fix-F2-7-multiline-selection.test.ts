/**
 * @jest-environment node
 *
 * A long or multi-line highlight is sent as rendered text. The stored answer
 * is markdown, so the two differ (paragraph breaks, bold, list numbers). The
 * server used to refuse those selections with "Selected text is not a
 * substring of the response content".
 */

import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationOnMessage,
} from "@/server/services/annotation";
import type { Actor } from "@/server/auth/session";

describe("F2.7 — long and multi-line selections", () => {
  const suffix = Date.now().toString();
  const ownerId = `user_ml_owner_${suffix}`;
  const outsiderId = `user_ml_outsider_${suffix}`;
  const actorOf = (userId: string): Actor => ({
    userId,
    sessionId: `sess_${userId}`,
    email: `${userId}@example.com`,
    role: "USER",
  });

  const markdown = [
    "## Consensus",
    "",
    "Raft uses **randomized** election timeouts to avoid _split votes_.",
    "",
    "1. A follower times out.",
    "2. It becomes a `candidate` and asks for votes.",
  ].join("\n");

  // What the browser reads from the page for a selection over all of it.
  const rendered =
    "Consensus\nRaft uses randomized election timeouts to avoid split votes.\n" +
    "A follower times out.\nIt becomes a candidate and asks for votes.";

  let workspaceId: string;
  let versionId: string;
  let answerMessageId: string;

  beforeAll(async () => {
    await db.user.createMany({
      data: [
        { id: ownerId, email: `${ownerId}@example.com`, name: "Owner" },
        { id: outsiderId, email: `${outsiderId}@example.com`, name: "Outsider" },
      ],
    });
    const ws = await db.workspace.create({
      data: { title: "Multi-line selection", ownerId },
    });
    workspaceId = ws.id;
    const response = await db.response.create({
      data: {
        workspaceId,
        createdById: ownerId,
        prompt: "Explain Raft",
        kind: "TEXT",
        origin: "DIRECT",
      },
    });
    const version = await db.responseVersion.create({
      data: {
        responseId: response.id,
        number: 1,
        status: "COMPLETE",
        content: markdown,
        modelKey: "text-standard",
        providerModelId: "test-model",
        promptVersion: "v1",
        createdById: ownerId,
      },
    });
    versionId = version.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    await db.user
      .deleteMany({ where: { id: { in: [ownerId, outsiderId] } } })
      .catch(() => {});
    await db.$disconnect();
  });

  it("accepts a selection that spans a heading, formatted text and list items", async () => {
    const created = await createAnnotation(actorOf(ownerId), versionId, {
      kind: "ASK",
      anchor: { exact: rendered, prefix: "", suffix: "", start: 0, end: rendered.length },
      text: "Summarise this",
      visibility: "WORKSPACE",
    });
    expect(created.anchorExact).toBe(rendered);

    // An answer to annotate at the next level.
    const answer = await db.annotationMessage.create({
      data: {
        annotationId: created.id,
        role: "ASSISTANT",
        content: markdown,
      },
    });
    answerMessageId = answer.id;
  });

  it("accepts the same kind of selection inside an Ask answer", async () => {
    const created = await createAnnotationOnMessage(actorOf(ownerId), answerMessageId, {
      kind: "COMMENT",
      anchor: { exact: rendered, prefix: "", suffix: "", start: 0, end: rendered.length },
      text: "Nested comment",
      visibility: "WORKSPACE",
    });
    expect(created.depth).toBe(1);
  });

  it("still refuses a passage that is not in the text", async () => {
    await expect(
      createAnnotation(actorOf(ownerId), versionId, {
        kind: "COMMENT",
        anchor: {
          exact: "Paxos is described here in three long paragraphs.",
          prefix: "",
          suffix: "",
          start: 0,
          end: 10,
        },
        text: "Fabricated quote",
        visibility: "WORKSPACE",
      })
    ).rejects.toThrow("not a substring");
  });

  it("hides the text from someone outside the workspace (404)", async () => {
    await expect(
      createAnnotation(actorOf(outsiderId), versionId, {
        kind: "COMMENT",
        anchor: { exact: rendered, prefix: "", suffix: "", start: 0, end: rendered.length },
        text: "Probe",
        visibility: "WORKSPACE",
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
