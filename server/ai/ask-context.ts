import "server-only";

import { db } from "@/server/db/client";
import { Errors } from "@/server/http/errors";
import { buildSystemPrompt } from "./prompts/system";
import { loadActiveNotes } from "./notes";
import {
  ASK_SYSTEM_INSTRUCTION,
  buildAskUserMessage,
} from "./prompts/annotation";
import { estimateTokens } from "./context-builder";
import type { Msg } from "./types";

export const MAX_TARGET_TOKENS = 12000;
export const WINDOW_BEFORE_TOKENS = 6000;
export const WINDOW_AFTER_TOKENS = 6000;

/**
 * Extracts markdown headings (# .. ######) as an outline.
 */
export function extractHeadingOutline(markdown: string): string {
  const matches = markdown.match(/^#{1,6}\s+.*$/gm);
  return matches ? matches.join("\n") : "";
}

/**
 * Windows target text if it exceeds 12k tokens:
 * 6k tokens before and after the anchor + the document's heading outline.
 */
export function windowTargetText(
  targetText: string,
  anchorExact: string
): string {
  const totalTokens = estimateTokens(targetText);
  if (totalTokens <= MAX_TARGET_TOKENS) {
    return targetText;
  }

  const outline = extractHeadingOutline(targetText);
  const anchorIdx = targetText.indexOf(anchorExact);

  // 1 token approx 4 characters
  const beforeChars = WINDOW_BEFORE_TOKENS * 4;
  const afterChars = WINDOW_AFTER_TOKENS * 4;

  const start = Math.max(0, (anchorIdx !== -1 ? anchorIdx : 0) - beforeChars);
  const end = Math.min(
    targetText.length,
    (anchorIdx !== -1 ? anchorIdx + anchorExact.length : 0) + afterChars
  );

  const snippet = targetText.slice(start, end);
  return [
    outline ? `Document Outline:\n${outline}` : "",
    "[... preceding content truncated ...]",
    snippet,
    "[... following content truncated ...]",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface BuildAskContextOptions {
  language: string | null;
  webSearch?: boolean;
}

/**
 * Builds the focused context for an Ask thread (Step F2.5):
 * - Target text is only the containing text (version, parent answer, or document revision).
 * - Windowed to 12k tokens if larger (6k before/after anchor + heading outline).
 * - System = buildSystemPrompt + active notes + Ask instructions.
 * - Messages = containing text + highlighted passage + thread messages.
 * - Never loads other responses of the workspace.
 */
export async function buildAskContext(
  annotationId: string,
  opts: BuildAskContextOptions
): Promise<{ system: string; messages: Msg[] }> {
  const annotation = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      version: {
        include: {
          response: {
            select: { id: true, workspaceId: true, prompt: true, deletedAt: true },
          },
        },
      },
      targetMessage: {
        include: {
          annotation: {
            select: {
              id: true,
              deletedAt: true,
              messages: {
                where: { role: "USER" },
                orderBy: { createdAt: "asc" },
                select: { content: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!annotation) {
    throw Errors.notFound("Annotation");
  }

  let rawTargetText = "";
  let sourceDescription: string | undefined;

  if (annotation.targetType === "RESPONSE_VERSION") {
    if (!annotation.version || annotation.version.response.deletedAt !== null) {
      throw Errors.notFound("ResponseVersion");
    }

    rawTargetText = annotation.version.content;
    if (annotation.contentSource === "EDIT") {
      if (annotation.editRevision) {
        const edit = await db.responseEdit.findUnique({
          where: {
            versionId_revision: {
              versionId: annotation.version.id,
              revision: annotation.editRevision,
            },
          },
        });
        if (edit) rawTargetText = edit.content;
      } else {
        const latestEdit = await db.responseEdit.findFirst({
          where: { versionId: annotation.version.id },
          orderBy: { revision: "desc" },
        });
        if (latestEdit) rawTargetText = latestEdit.content;
      }
    }

    sourceDescription = annotation.version.response.prompt
      ? `Original prompt: "${annotation.version.response.prompt}"`
      : undefined;
  } else if (annotation.targetType === "ANNOTATION_MESSAGE") {
    const parentMsg = annotation.targetMessage;
    if (!parentMsg || parentMsg.annotation.deletedAt !== null) {
      throw Errors.notFound("AnnotationMessage");
    }

    rawTargetText = parentMsg.content;

    // Find the question that produced the parent answer
    const parentUserMsgs = parentMsg.annotation.messages || [];
    const priorUserMsgs = parentUserMsgs.filter(
      (m: { createdAt: Date }) => m.createdAt <= parentMsg.createdAt
    );
    const parentQuestion = priorUserMsgs.length
      ? priorUserMsgs[priorUserMsgs.length - 1].content
      : "";

    sourceDescription = parentQuestion
      ? `Parent answer to question: "${parentQuestion}"`
      : "Parent answer";
  } else if (annotation.targetType === "DOCUMENT_REVISION") {
    // Document revisions (F3)
    sourceDescription = "Document generated earlier";
    rawTargetText = "Document content generated earlier";
  } else {
    rawTargetText = annotation.anchorExact;
  }

  // Window target text if > 12k tokens
  const containingText = windowTargetText(rawTargetText, annotation.anchorExact);

  // System prompt assembly
  const baseSystem = buildSystemPrompt(opts.language || "en");
  const notesPrompt = await loadActiveNotes(annotation.workspaceId);
  const system = [baseSystem, notesPrompt, ASK_SYSTEM_INSTRUCTION]
    .filter(Boolean)
    .join("\n\n");

  // Thread messages assembly
  const messages: Msg[] = [];
  const rawMsgs = annotation.messages || [];
  const firstUserMsg = rawMsgs.find((m) => m.role === "USER");
  const firstUserPrompt = firstUserMsg ? firstUserMsg.content : "";

  // The first user message embeds the containing text and highlighted passage
  const firstUserText = buildAskUserMessage({
    containingText,
    anchorExact: annotation.anchorExact,
    question: firstUserPrompt,
    sourceDescription,
  });

  messages.push({
    role: "user",
    parts: [{ type: "text", text: firstUserText }],
  });

  // Follow-up turns in this thread (excluding the initial user message)
  const subsequentMsgs = rawMsgs.filter((m) => m.id !== firstUserMsg?.id);
  for (const m of subsequentMsgs) {
    if (m.role === "ASSISTANT" && m.content) {
      messages.push({
        role: "assistant",
        parts: [{ type: "text", text: m.content }],
      });
    } else if (m.role === "USER" && m.content) {
      messages.push({
        role: "user",
        parts: [{ type: "text", text: m.content }],
      });
    }
  }

  return {
    system,
    messages,
  };
}
