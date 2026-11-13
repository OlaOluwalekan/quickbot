import "server-only";
import crypto from "crypto";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import type { Actor } from "@/server/auth/session";
import { requireWorkspace } from "@/server/authz/access";
import { ApiError, Errors } from "@/server/http/errors";
import { PLANS, type PlanKey } from "@/server/billing/plans";
import { getEntitlements } from "@/server/billing/entitlements";
import type { ToolSpec } from "@/server/ai/types";
import { getStorageProvider } from "@/server/storage";
import {
  exportResponseToMarkdown,
  exportWorkspaceToMarkdown,
  type ExportCitationItem,
} from "./export-markdown";
import { isTrustedCloudinaryImageUrl } from "./markdown-to-docx";

export {
  exportResponseToMarkdown,
  exportWorkspaceToMarkdown,
  isTrustedCloudinaryImageUrl,
};

export type ExportFormat = "md" | "pdf" | "docx";

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Provider-neutral ToolSpec for natural-language document generation requests (§5.6).
 */
export const CREATE_DOCUMENT_TOOL: ToolSpec = {
  name: "create_document",
  description:
    "Create a downloadable document. After the tool returns, write: (1) a 2–4 sentence summary of what the document contains, (2) 'Assumptions:' bullet list if you assumed anything, (3) 'Questions:' bullet list if information was missing. Do not paste the document content into the chat.",
  parameters: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["pdf", "docx", "md"] },
      title: { type: "string" },
      markdown: { type: "string" },
    },
    required: ["format", "title", "markdown"],
  },
};

/**
 * Daily export caps per plan (0 credits charged, rate-limited per day).
 */
export const DAILY_EXPORT_CAPS: Record<PlanKey, number> = {
  FREE: 10,
  LITE: 30,
  STANDARD: 100,
  PRO: 300,
};

const dailyExportCounts = new Map<string, number>();
let customDailyCapOverride: number | null = null;

export function resetExportRateLimitsForTesting(): void {
  dailyExportCounts.clear();
  customDailyCapOverride = null;
}

export function setDailyExportCapForTesting(cap: number | null): void {
  customDailyCapOverride = cap;
}

async function resolveExportPlanForUser(
  userId: string,
  explicitPlan?: PlanKey
): Promise<PlanKey> {
  if (explicitPlan && explicitPlan in PLANS) {
    return explicitPlan;
  }

  const entitlements = await getEntitlements(userId);
  return entitlements.plan;
}

function checkAndIncrementDailyExportCap(userId: string, plan: PlanKey): void {
  const dayKey = new Date().toISOString().slice(0, 10);
  const mapKey = `${userId}:${dayKey}`;
  const current = dailyExportCounts.get(mapKey) ?? 0;
  const maxAllowed = customDailyCapOverride ?? DAILY_EXPORT_CAPS[plan] ?? 10;

  if (current >= maxAllowed) {
    throw new ApiError(
      429,
      "rate_limited",
      `Daily export cap (${maxAllowed}) reached for your ${PLANS[plan].name} plan.`
    );
  }

  dailyExportCounts.set(mapKey, current + 1);
}

/**
 * Strips ASCII/Unicode control characters from a single-line title and enforces <= 120 chars.
 */
export function sanitizeDocumentTitle(raw: string): string {
  const stripped = raw
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) {
    throw Errors.validation([
      { field: "title", message: "Document title cannot be empty" },
    ]);
  }

  if (stripped.length > 120) {
    throw Errors.validation([
      { field: "title", message: "Document title must be 120 characters or fewer" },
    ]);
  }

  return stripped;
}

/**
 * Strips dangerous control characters (preserving \n, \r, \t) from markdown and enforces <= 200,000 chars.
 */
export function sanitizeDocumentMarkdown(raw: string): string {
  const stripped = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  if (!stripped.trim()) {
    throw Errors.validation([
      { field: "markdown", message: "Document markdown content cannot be empty" },
    ]);
  }

  if (stripped.length > 200_000) {
    throw Errors.validation([
      {
        field: "markdown",
        message: "Document markdown content exceeds maximum length of 200,000 characters",
      },
    ]);
  }

  return stripped;
}

/**
 * Builds a sanitized filename and RFC 5987 Content-Disposition header (`filename*=UTF-8''...`).
 */
export function buildExportFilename(
  rawTitle: string,
  format: ExportFormat
): {
  filename: string;
  contentDisposition: string;
  mime: string;
} {
  const cleanedBase =
    rawTitle
      .replace(/[\x00-\x1F\x7F-\x9F/\\:*?"<>|]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._\-\u00A0-\uFFFF]/g, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "klecx-export";

  const asciiBase =
    cleanedBase
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "klecx-export";

  const filename = `${cleanedBase}.${format}`;
  const asciiFilename = `${asciiBase}.${format}`;
  const encodedFilename = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
  return {
    filename,
    contentDisposition,
    mime: EXPORT_MIME_TYPES[format],
  };
}

/**
 * Renders a Markdown document into the requested format (md, pdf, docx).
 */
export async function renderDocumentBuffer(params: {
  format: ExportFormat;
  title: string;
  date: Date;
  sourceUrl?: string | null;
  modelKey?: string | null;
  versionNumber?: number | null;
  markdown: string;
  citations?: ExportCitationItem[];
}): Promise<Buffer> {
  const {
    format,
    title,
    date,
    sourceUrl,
    modelKey,
    versionNumber,
    markdown,
    citations,
  } = params;

  if (format === "md") {
    const mdText = exportResponseToMarkdown({
      title,
      date,
      sourceUrl,
      modelKey,
      versionNumber,
      content: markdown,
      citations,
    });
    return Buffer.from(mdText, "utf-8");
  }

  if (format === "docx") {
    const { renderMarkdownToDocx } = await import("./markdown-to-docx");
    return renderMarkdownToDocx({
      title,
      date,
      sourceUrl,
      modelKey,
      versionNumber,
      markdown,
      citations,
    });
  }

  if (format === "pdf") {
    const { renderMarkdownToPdf } = await import("./markdown-to-pdf");
    return renderMarkdownToPdf({
      title,
      date,
      sourceUrl,
      modelKey,
      versionNumber,
      markdown,
      citations,
    });
  }

  throw Errors.validation([
    { field: "format", message: `Unsupported export format: ${String(format)}` },
  ]);
}

/**
 * Stores a rendered document in private cloud storage as GENERATED_DOCUMENT and creates the DB row.
 * When `responseId` is null, the 24h TTL cleanup job will automatically prune it.
 * When `responseId` is set (e.g. from `create_document` tool), it stays attached to the response.
 */
async function storeGeneratedDocument(params: {
  actorId: string;
  workspaceId: string;
  responseId: string | null;
  format: ExportFormat;
  filename: string;
  buffer: Buffer;
}) {
  const { actorId, workspaceId, responseId, format, filename, buffer } = params;
  const storage = getStorageProvider();
  const folder = env.CLOUDINARY_UPLOAD_FOLDER || "klecx/dev";
  const publicId = `${folder}/${workspaceId}/doc_${crypto.randomUUID()}`;
  const mime = EXPORT_MIME_TYPES[format].split(";")[0]!;

  const uploaded = await storage.uploadBuffer(buffer, {
    publicId,
    folder,
    resourceType: "raw",
    format,
    mime,
    isPublic: false,
  });

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const attachment = await db.attachment.create({
    data: {
      ownerId: actorId,
      workspaceId,
      responseId,
      kind: "GENERATED_DOCUMENT",
      status: "READY",
      providerId: uploaded.publicId,
      resourceType: "raw",
      mime,
      bytes: buffer.byteLength,
      originalName: filename,
      sha256,
    },
  });

  return attachment;
}

/**
 * Exports a single response in MD, PDF, or DOCX format (§5.6).
 * - Requires `workspace.export`.
 * - Enforces plan `exportFormats` and daily export cap (0 credits charged).
 * - Includes source workspace URL ONLY if the exporter owns the workspace.
 * - Exports ONLY that response (+ its citations): never annotations, comments, other responses, or member names.
 */
export async function exportResponseDocument(
  actor: Actor,
  responseId: string,
  options: {
    format: ExportFormat;
    view?: "original" | "edited";
    userPlan?: PlanKey;
  }
) {
  const { format, view = "edited" } = options;
  if (!["md", "pdf", "docx"].includes(format)) {
    throw Errors.validation([
      { field: "format", message: "Invalid export format. Expected md, pdf, or docx." },
    ]);
  }

  const response = await db.response.findUnique({
    where: { id: responseId, deletedAt: null },
    select: {
      id: true,
      workspaceId: true,
      prompt: true,
      kind: true,
      activeVersionId: true,
      createdAt: true,
      versions: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          content: true,
          modelKey: true,
          createdAt: true,
          edits: {
            orderBy: { revision: "desc" },
            take: 1,
            select: {
              content: true,
            },
          },
          citations: {
            orderBy: { index: "asc" },
            select: {
              index: true,
              url: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!response) {
    throw Errors.notFound("Response");
  }

  // Require workspace.export permission (OWNER, ADMIN, EDITOR)
  const access = await requireWorkspace(
    actor,
    response.workspaceId,
    "workspace.export"
  );

  // Check plan export format entitlement
  const effectivePlan = await resolveExportPlanForUser(
    actor.userId,
    options.userPlan
  );
  const allowedFormats = PLANS[effectivePlan].limits.exportFormats;
  if (!allowedFormats.includes(format)) {
    throw new ApiError(
      403,
      "plan_upgrade_required",
      `Your ${PLANS[effectivePlan].name} plan only supports ${allowedFormats.map((f) => f.toUpperCase()).join(", ")} exports. Upgrade to export as ${format.toUpperCase()}.`
    );
  }

  // Enforce daily export cap (0 credits charged)
  checkAndIncrementDailyExportCap(actor.userId, effectivePlan);

  const activeVer =
    response.versions.find((v) => v.id === response.activeVersionId) ??
    response.versions.at(-1) ??
    null;

  if (!activeVer) {
    throw Errors.notFound("ResponseVersion");
  }

  const latestEdit = activeVer.edits[0] ?? null;
  const effectiveContent =
    view === "original"
      ? activeVer.content
      : (latestEdit?.content ?? activeVer.content);

  // Source workspace URL is included ONLY if the exporter owns the workspace
  const isWorkspaceOwner = access.ws.ownerId === actor.userId;
  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const sourceUrl = isWorkspaceOwner
    ? `${appUrl}/workspaces/${response.workspaceId}`
    : null;

  // An uploaded document (F3.1) is the member's own file: its download holds
  // the text and nothing about the workspace or the model. Its "prompt" is
  // the file name, so the extension is dropped ("report.docx" → "report").
  const isUploadedDocument = response.kind === "DOCUMENT";
  const promptTitle = response.prompt.replace(/[\r\n]+/g, " ").trim();
  const rawTitle =
    (isUploadedDocument
      ? promptTitle.replace(/\.[a-z0-9]{1,5}$/i, "")
      : promptTitle
    ).slice(0, 80) || "Response Export";

  const date = activeVer.createdAt ?? response.createdAt;
  const citations: ExportCitationItem[] = (activeVer.citations || []).map(
    (c) => ({
      index: c.index,
      url: c.url,
      title: c.title,
    })
  );

  const buffer =
    isUploadedDocument && format === "md"
      ? Buffer.from(effectiveContent, "utf-8")
      : await renderDocumentBuffer({
          format,
          title: rawTitle,
          date,
          sourceUrl: isUploadedDocument ? null : sourceUrl,
          modelKey: isUploadedDocument ? null : activeVer.modelKey,
          versionNumber: isUploadedDocument ? null : activeVer.number,
          markdown: effectiveContent,
          citations,
        });

  const { filename, contentDisposition, mime } = buildExportFilename(
    rawTitle,
    format
  );

  // Store with responseId: null so it has a 24h TTL unless explicitly attached
  const attachment = await storeGeneratedDocument({
    actorId: actor.userId,
    workspaceId: response.workspaceId,
    responseId: null,
    format,
    filename,
    buffer,
  });

  return {
    buffer,
    filename,
    contentDisposition,
    mime,
    attachmentId: attachment.id,
  };
}

/**
 * Exports an entire workspace timeline in MD, PDF, or DOCX format (§5.6).
 * - Requires OWNER or ADMIN role on the workspace.
 * - Includes source workspace URL ONLY if the exporter owns the workspace.
 * - Never includes annotations, comments, or member names.
 */
export async function exportWorkspaceDocument(
  actor: Actor,
  workspaceId: string,
  options: {
    format: ExportFormat;
    view?: "original" | "edited";
    userPlan?: PlanKey;
  }
) {
  const { format, view = "edited" } = options;
  if (!["md", "pdf", "docx"].includes(format)) {
    throw Errors.validation([
      { field: "format", message: "Invalid export format. Expected md, pdf, or docx." },
    ]);
  }

  const access = await requireWorkspace(actor, workspaceId, "workspace.export");
  if (access.role !== "OWNER" && access.role !== "ADMIN") {
    throw Errors.forbidden(
      "Only workspace owners and admins can export an entire workspace."
    );
  }

  const effectivePlan = await resolveExportPlanForUser(
    actor.userId,
    options.userPlan
  );
  const allowedFormats = PLANS[effectivePlan].limits.exportFormats;
  if (!allowedFormats.includes(format)) {
    throw new ApiError(
      403,
      "plan_upgrade_required",
      `Your ${PLANS[effectivePlan].name} plan only supports ${allowedFormats.map((f) => f.toUpperCase()).join(", ")} exports. Upgrade to export as ${format.toUpperCase()}.`
    );
  }

  checkAndIncrementDailyExportCap(actor.userId, effectivePlan);

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId, deletedAt: null },
    select: {
      id: true,
      title: true,
      ownerId: true,
      createdAt: true,
    },
  });

  if (!workspace) {
    throw Errors.notFound("Workspace");
  }

  const responses = await db.response.findMany({
    where: {
      workspaceId,
      deletedAt: null,
    },
    orderBy: [{ sortAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      prompt: true,
      kind: true,
      activeVersionId: true,
      createdAt: true,
      uploadedAttachment: {
        select: {
          originalName: true,
        },
      },
      versions: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          content: true,
          modelKey: true,
          createdAt: true,
          edits: {
            orderBy: { revision: "desc" },
            take: 1,
            select: { content: true },
          },
          citations: {
            orderBy: { index: "asc" },
            select: { index: true, url: true, title: true },
          },
        },
      },
    },
  });

  const turns = responses
    .map((r) => {
      const activeVer =
        r.versions.find((v) => v.id === r.activeVersionId) ??
        r.versions.at(-1) ??
        null;
      if (!activeVer) return null;
      const latestEdit = activeVer.edits[0] ?? null;
      const content =
        view === "original"
          ? activeVer.content
          : (latestEdit?.content ?? activeVer.content);
      return {
        prompt: r.prompt,
        content,
        kind: r.kind,
        documentName: r.uploadedAttachment?.originalName || r.prompt,
        modelKey: activeVer.modelKey,
        versionNumber: activeVer.number,
        createdAt: activeVer.createdAt ?? r.createdAt,
        citations: activeVer.citations,
      };
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const isWorkspaceOwner = workspace.ownerId === actor.userId;
  const appUrl = (env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const sourceUrl = isWorkspaceOwner
    ? `${appUrl}/workspaces/${workspaceId}`
    : null;

  const title = workspace.title || "Workspace Export";
  const now = new Date();

  const fullMarkdown = exportWorkspaceToMarkdown({
    title,
    date: now,
    sourceUrl,
    turns,
  });

  let buffer: Buffer;
  if (format === "md") {
    buffer = Buffer.from(fullMarkdown, "utf-8");
  } else {
    // Strip YAML front-matter when feeding to PDF/DOCX renderer since title/sourceUrl are passed as metadata
    const bodyMarkdown = fullMarkdown.replace(/^---[\s\S]*?---\n+/, "");
    buffer = await renderDocumentBuffer({
      format,
      title,
      date: now,
      sourceUrl,
      markdown: bodyMarkdown,
    });
  }

  const { filename, contentDisposition, mime } = buildExportFilename(
    title,
    format
  );

  const attachment = await storeGeneratedDocument({
    actorId: actor.userId,
    workspaceId,
    responseId: null,
    format,
    filename,
    buffer,
  });

  return {
    buffer,
    filename,
    contentDisposition,
    mime,
    attachmentId: attachment.id,
  };
}

/**
 * Handles the `create_document` tool call emitted by an AI provider during streaming (§5.6).
 * Validates `title` (<= 120 chars), `markdown` (<= 200k chars), strips control characters,
 * renders the document with our server renderer, stores it as GENERATED_DOCUMENT linked to `responseId`,
 * and returns the attachment + downloadable Markdown card snippet.
 */
export async function executeCreateDocumentToolCall(params: {
  actorId: string;
  workspaceId: string;
  responseId: string;
  versionId?: string;
  modelKey?: string;
  versionNumber?: number;
  args: unknown;
}) {
  const { actorId, workspaceId, responseId, modelKey, versionNumber, args } =
    params;

  if (!args || typeof args !== "object") {
    throw Errors.validation([
      { field: "args", message: "Invalid create_document tool arguments" },
    ]);
  }

  const rawArgs = args as Record<string, unknown>;
  const rawFormat = String(rawArgs.format ?? "").toLowerCase().trim();
  if (rawFormat !== "pdf" && rawFormat !== "docx" && rawFormat !== "md") {
    throw Errors.validation([
      { field: "format", message: "Format must be pdf, docx, or md" },
    ]);
  }
  const format = rawFormat as ExportFormat;

  const title = sanitizeDocumentTitle(String(rawArgs.title ?? ""));
  const markdown = sanitizeDocumentMarkdown(String(rawArgs.markdown ?? ""));

  let targetVersionId = params.versionId;
  if (!targetVersionId) {
    const resp = await db.response.findUnique({
      where: { id: responseId },
      select: {
        activeVersionId: true,
        versions: { orderBy: { number: "desc" }, take: 1, select: { id: true } },
      },
    });
    targetVersionId = resp?.activeVersionId || resp?.versions?.[0]?.id;
    if (!targetVersionId) {
      const fallbackVer = await db.responseVersion.create({
        data: {
          responseId,
          number: versionNumber ?? 1,
          status: "COMPLETE",
          content: "",
          modelKey: modelKey || "text-economy",
          providerModelId: "text-economy",
          promptVersion: "v1",
          createdById: actorId,
        },
      });
      targetVersionId = fallbackVer.id;
    }
  }

  const doc = await db.document.create({
    data: {
      workspaceId,
      versionId: targetVersionId,
      title,
      format,
      currentRevision: 1,
      createdById: actorId,
      revisions: {
        create: {
          revision: 1,
          content: markdown,
          editorId: null,
        },
      },
    },
    include: {
      revisions: true,
    },
  });

  let attachment: any = null;
  const { filename } = buildExportFilename(title, format);
  try {
    const buffer = await renderDocumentBuffer({
      format,
      title,
      date: new Date(),
      modelKey: modelKey ?? null,
      versionNumber: versionNumber ?? 1,
      markdown,
    });
    attachment = await storeGeneratedDocument({
      actorId,
      workspaceId,
      responseId,
      format,
      filename,
      buffer,
    });
  } catch (err) {
    console.warn("[Documents] Pre-rendering initial export failed, will render on-demand:", err);
  }

  const downloadUrl = `/api/v1/documents/${doc.id}/download?format=${format}&revision=1`;

  return {
    document: doc,
    documentId: doc.id,
    title: doc.title,
    format: doc.format,
    currentRevision: doc.currentRevision,
    markdown,
    attachment,
    filename,
    downloadUrl,
    cardMarkdown: "",
  };
}
