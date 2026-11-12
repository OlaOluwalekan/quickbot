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
import { locateQuote } from "@/lib/annotations/quote-match";
import type { Msg } from "./types";

export const MAX_TARGET_TOKENS = 12000;
export const WINDOW_BEFORE_TOKENS = 6000;
export const WINDOW_AFTER_TOKENS = 6000;

/** Same ratio as `estimateTokens`: about 4 characters per token. */
const CHARS_PER_TOKEN = 4;

/**
 * Extracts markdown headings (# .. ######) as an outline. Lines inside fenced
 * code blocks are skipped (a `# comment` in code is not a heading).
 */
export function extractHeadingOutline(markdown: string): string {
  const headings: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^#{1,6}\s+\S/.test(line)) headings.push(line.trim());
  }
  return headings.join("\n");
}

/** True when the text is too long to be sent whole. */
export function needsWindow(targetText: string): boolean {
  return estimateTokens(targetText) > MAX_TARGET_TOKENS;
}

/**
 * Windows target text if it exceeds 12k tokens:
 * 6k tokens before and after the anchor + the document's heading outline.
 *
 * `anchorStart` (the saved offset of the highlight) picks the right occurrence
 * when the passage appears more than once.
 */
export function windowTargetText(
  targetText: string,
  anchorExact: string,
  anchorStart?: number | null
): string {
  if (!needsWindow(targetText)) {
    return targetText;
  }

  // The saved offset counts rendered characters, so it only helps when the
  // text has no markdown before the passage. Otherwise search for the passage.
  const located =
    typeof anchorStart === "number" &&
    targetText.startsWith(anchorExact, anchorStart)
      ? { start: anchorStart, end: anchorStart + anchorExact.length }
      : locateQuote(targetText, anchorExact);
  // Passage not found (e.g. the text was edited since): keep the beginning.
  const anchorFrom = located?.start ?? 0;
  const anchorTo = located?.end ?? 0;

  const start = Math.max(0, anchorFrom - WINDOW_BEFORE_TOKENS * CHARS_PER_TOKEN);
  const end = Math.min(
    targetText.length,
    anchorTo + WINDOW_AFTER_TOKENS * CHARS_PER_TOKEN
  );

  const outline = extractHeadingOutline(targetText);
  return [
    outline ? `Document Outline:\n${outline}` : "",
    start > 0 ? "[... preceding content truncated ...]" : "",
    targetText.slice(start, end),
    end < targetText.length ? "[... following content truncated ...]" : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Relations needed to find the text an Ask's highlight sits in. Use it as the
 * `include` of an annotation query, then call `loadAskTarget`.
 */
export const ASK_TARGET_INCLUDE = {
  version: {
    include: {
      response: {
        select: { id: true, prompt: true, deletedAt: true },
      },
    },
  },
  // Nested annotations sit on an ASSISTANT message of a parent thread.
  targetMessage: {
    include: {
      annotation: {
        select: {
          id: true,
          deletedAt: true,
          messages: {
            where: { role: "USER" as const },
            orderBy: { createdAt: "asc" as const },
            select: { content: true, createdAt: true },
          },
        },
      },
    },
  },
};

interface AskTargetAnnotation {
  id: string;
  targetType: string;
  anchorExact: string;
  contentSource: string;
  editRevision: number | null;
  version: {
    id: string;
    content: string;
    response: { prompt: string; deletedAt: Date | null };
  } | null;
  targetMessage: {
    id: string;
    content: string;
    createdAt: Date;
    annotation: {
      deletedAt: Date | null;
      messages: Array<{ content: string; createdAt: Date }>;
    };
  } | null;
}

export interface AskTarget {
  /** Identifies the containing text; Asks with the same key share it. */
  key: string;
  /** The full text the highlight sits in (not windowed). */
  text: string;
  /** One line that says where the text comes from. */
  description: string;
}

/**
 * The text an Ask's highlight sits in, and where it comes from:
 * - RESPONSE_VERSION: the version (or the edit the highlight was made on) +
 *   the prompt that produced it.
 * - ANNOTATION_MESSAGE: the parent answer + the question that produced it.
 *
 * Returns null when the target was deleted.
 */
export async function loadAskTarget(
  annotation: AskTargetAnnotation
): Promise<AskTarget | null> {
  if (annotation.targetType === "RESPONSE_VERSION") {
    const version = annotation.version;
    if (!version || version.response.deletedAt !== null) return null;

    let text = version.content;
    let key = `version:${version.id}`;
    if (annotation.contentSource === "EDIT") {
      const edit = annotation.editRevision
        ? await db.responseEdit.findUnique({
            where: {
              versionId_revision: {
                versionId: version.id,
                revision: annotation.editRevision,
              },
            },
          })
        : await db.responseEdit.findFirst({
            where: { versionId: version.id },
            orderBy: { revision: "desc" },
          });
      if (edit) {
        text = edit.content;
        key = `version:${version.id}:edit:${edit.revision}`;
      }
    }

    return {
      key,
      text,
      description: version.response.prompt
        ? `This text answered the request: "${version.response.prompt}"`
        : "An earlier answer",
    };
  }

  if (annotation.targetType === "ANNOTATION_MESSAGE") {
    const parent = annotation.targetMessage;
    if (!parent || parent.annotation.deletedAt !== null) return null;

    // The question that produced the parent answer: the last USER message
    // written before it.
    const asked = parent.annotation.messages.filter(
      (m) => m.createdAt <= parent.createdAt
    );
    const question = asked[asked.length - 1]?.content ?? "";

    return {
      key: `message:${parent.id}`,
      text: parent.content,
      description: question
        ? `This text answered the side question: "${question}"`
        : "An earlier answer to a side question",
    };
  }

  // DOCUMENT_REVISION: documents arrive with F3; until then only the quoted
  // passage is known.
  return {
    key: `annotation:${annotation.id}`,
    text: annotation.anchorExact,
    description: "A passage of a document",
  };
}

export interface BuildAskContextOptions {
  /** Response language (already resolved); null = the default. */
  language: string | null;
  /** Reserved for F4.1 (web search as a tool); not used yet. */
  webSearch?: boolean;
}

/**
 * Builds the focused context for an Ask thread (Step F2.5):
 * - Target text is only the containing text (version, parent answer, or document revision).
 * - Windowed to 12k tokens if larger (6k before/after anchor + heading outline).
 * - System = buildSystemPrompt + active notes + Ask instructions.
 * - Messages = containing text + highlighted passage + first question, then
 *   the rest of this thread (answers and follow-ups).
 * - Never loads other responses of the workspace.
 *
 * Answers that failed or are still being written are left out. The caller
 * checks access; this function does not.
 */
export async function buildAskContext(
  annotationId: string,
  opts: BuildAskContextOptions
): Promise<{ system: string; messages: Msg[] }> {
  const annotation = await db.annotation.findUnique({
    where: { id: annotationId, deletedAt: null },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      ...ASK_TARGET_INCLUDE,
    },
  });

  if (!annotation) {
    throw Errors.notFound("Annotation");
  }

  const target = await loadAskTarget(annotation);
  if (!target) {
    throw Errors.notFound("Annotation");
  }

  const containingText = windowTargetText(
    target.text,
    annotation.anchorExact,
    annotation.anchorStart
  );

  const notesPrompt = await loadActiveNotes(annotation.workspaceId);
  const system = [
    buildSystemPrompt(opts.language || undefined),
    notesPrompt,
    ASK_SYSTEM_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");

  const thread = annotation.messages.filter(
    (m) =>
      m.content.trim() &&
      (m.role === "USER" || (m.role === "ASSISTANT" && m.status === "COMPLETE"))
  );
  const firstQuestion = thread.find((m) => m.role === "USER");

  // The first user message carries the containing text and the passage.
  const messages: Msg[] = [
    {
      role: "user",
      parts: [
        {
          type: "text",
          text: buildAskUserMessage({
            containingText,
            anchorExact: annotation.anchorExact,
            question: firstQuestion?.content ?? "",
            sourceDescription: target.description,
          }),
        },
      ],
    },
  ];

  for (const m of thread) {
    if (m.id === firstQuestion?.id) continue;
    messages.push({
      role: m.role === "ASSISTANT" ? "assistant" : "user",
      parts: [{ type: "text", text: m.content }],
    });
  }

  return { system, messages };
}

/** Rough size of a built context, for the credit reservation. */
export function estimateAskContextTokens(ctx: {
  system: string;
  messages: Msg[];
}): number {
  let tokens = estimateTokens(ctx.system);
  for (const m of ctx.messages) {
    for (const p of m.parts) {
      if (p.type === "text") tokens += estimateTokens(p.text);
    }
  }
  return tokens;
}
