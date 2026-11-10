/**
 * @jest-environment node
 */

import crypto from "node:crypto";
import { db } from "@/server/db/client";
import {
  createAnnotation,
  createAnnotationOnMessage,
  createAndStreamAnnotationReply,
  getAnnotationChain,
  setAnnotationCustomProviderForTesting,
} from "@/server/services/annotation";
import type { AiProvider, StreamEvent } from "@/server/ai/types";
import type { Actor } from "@/server/auth/session";

class FakeAskProvider implements AiProvider {
  id = "gemini" as const;
  async *stream(): AsyncIterable<StreamEvent> {
    yield { type: "text_delta", text: "Answer content for testing chain." };
    yield { type: "usage", inputTokens: 40, outputTokens: 8, estimated: false };
  }
}

async function drain(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // drain stream
  }
}

describe("Fix F2.4 — Annotation Ancestor Chain (Recursive CTE & API)", () => {
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let outsider: { id: string; email: string };
  let workspace: { id: string };
  let ownerActor: Actor;
  let memberActor: Actor;
  let outsiderActor: Actor;
  let versionId: string;
  let responseId: string;

  beforeAll(async () => {
    owner = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f24-owner-${Date.now()}@example.com`,
        name: "F24 Owner",
        username: `f24owner_${Date.now()}`,
      },
    });

    member = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f24-member-${Date.now()}@example.com`,
        name: "F24 Member",
        username: `f24member_${Date.now()}`,
      },
    });

    outsider = await db.user.create({
      data: {
        id: crypto.randomUUID(),
        email: `f24-outsider-${Date.now()}@example.com`,
        name: "F24 Outsider",
        username: `f24outsider_${Date.now()}`,
      },
    });

    ownerActor = {
      userId: owner.id,
      email: owner.email,
      role: "USER",
      sessionId: "sess_f24_owner",
    };

    memberActor = {
      userId: member.id,
      email: member.email,
      role: "USER",
      sessionId: "sess_f24_member",
    };

    outsiderActor = {
      userId: outsider.id,
      email: outsider.email,
      role: "USER",
      sessionId: "sess_f24_outsider",
    };

    workspace = await db.workspace.create({
      data: {
        id: crypto.randomUUID(),
        title: "F2.4 Chain Test Workspace",
        ownerId: owner.id,
      },
    });

    await db.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: member.id,
        role: "EDITOR",
        canComment: true,
        canAsk: true,
        invitedById: owner.id,
      },
    });

    const response = await db.response.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        prompt: "Chain test prompt",
        createdById: owner.id,
      },
    });
    responseId = response.id;

    const version = await db.responseVersion.create({
      data: {
        id: crypto.randomUUID(),
        responseId: response.id,
        number: 1,
        content: "Root response content with highlightable words for testing.",
        modelKey: "text-economy",
        providerModelId: "gemini-flash",
        promptVersion: "1",
        createdById: owner.id,
      },
    });
    versionId = version.id;

    setAnnotationCustomProviderForTesting(new FakeAskProvider());
  });

  afterAll(async () => {
    setAnnotationCustomProviderForTesting(null);
  });

  it("returns single root annotation when depth is 0", async () => {
    const root = await createAnnotation(ownerActor, versionId, {
      kind: "COMMENT",
      anchor: { exact: "Root response" },
      contentSource: "ORIGINAL",
      text: "Root level comment",
    });

    const chain = await getAnnotationChain(ownerActor, root.id);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.id).toBe(root.id);
    expect(chain[0]!.depth).toBe(0);
  });

  it("returns full ancestor chain in depth ASC order for multi-level nested asks", async () => {
    // 1. Root L0 Ask
    const l0Ask = await db.annotation.create({
      data: {
        workspaceId: workspace.id,
        responseId,
        versionId,
        kind: "ASK",
        visibility: "WORKSPACE",
        targetType: "RESPONSE_VERSION",
        depth: 0,
        anchorExact: "highlightable",
        anchorPrefix: "",
        anchorSuffix: "",
        createdById: owner.id,
        messages: {
          create: [
            { role: "USER", content: "What is highlightable?", authorId: owner.id },
            { role: "ASSISTANT", content: "Answer content for testing chain." },
          ],
        },
      },
      include: { messages: true },
    });
    const l0AssistantMsg = l0Ask.messages.find((m) => m.role === "ASSISTANT")!;
    expect(l0AssistantMsg).toBeDefined();

    // 2. Nested L1 Ask on the assistant message
    const l1Ask = await createAnnotationOnMessage(memberActor, l0AssistantMsg.id, {
      kind: "ASK",
      anchor: { exact: "Answer content" },
      text: "Tell me more about the answer",
      mode: "now",
      visibility: "WORKSPACE",
    });
    expect(l1Ask.depth).toBe(1);
    expect(l1Ask.parentAnnotationId).toBe(l0Ask.id);

    // Add assistant message to L1
    const l1AssistantMsg = await db.annotationMessage.create({
      data: {
        annotationId: l1Ask.id,
        role: "ASSISTANT",
        content: "Second level answer content for testing.",
      },
    });

    // 3. Nested L2 Ask on L1's assistant message
    const l2Ask = await createAnnotationOnMessage(ownerActor, l1AssistantMsg.id, {
      kind: "ASK",
      anchor: { exact: "testing" },
      text: "Even deeper question",
      mode: "now",
    });
    expect(l2Ask.depth).toBe(2);
    expect(l2Ask.parentAnnotationId).toBe(l1Ask.id);

    // 4. Call getAnnotationChain for L2
    const chain = await getAnnotationChain(ownerActor, l2Ask.id);
    expect(chain).toHaveLength(3);
    expect(chain[0]!.id).toBe(l0Ask.id);
    expect(chain[0]!.depth).toBe(0);
    expect(chain[1]!.id).toBe(l1Ask.id);
    expect(chain[1]!.depth).toBe(1);
    expect(chain[2]!.id).toBe(l2Ask.id);
    expect(chain[2]!.depth).toBe(2);

    // Each ancestor has loaded messages and createdBy
    expect(chain[0]!.messages.length).toBeGreaterThan(0);
    expect(chain[1]!.messages.length).toBeGreaterThan(0);
    expect(chain[2]!.createdBy).toBeDefined();
  });

  it("denies access to non-workspace member", async () => {
    const root = await createAnnotation(ownerActor, versionId, {
      kind: "COMMENT",
      anchor: { exact: "words" },
      contentSource: "ORIGINAL",
      text: "Private check",
    });

    await expect(getAnnotationChain(outsiderActor, root.id)).rejects.toThrow();
  });
});
