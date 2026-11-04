import "server-only";

export interface ExportCitationItem {
  index: number;
  url: string;
  title?: string | null;
}

export interface ExportMarkdownInput {
  title: string;
  date: Date;
  /**
   * Source workspace URL — ONLY populated if the exporter owns the workspace.
   */
  sourceUrl?: string | null;
  modelKey?: string | null;
  versionNumber?: number | null;
  content: string;
  citations?: ExportCitationItem[];
}

export interface ExportWorkspaceTurn {
  prompt: string;
  content: string;
  modelKey?: string | null;
  versionNumber?: number | null;
  createdAt?: Date;
  citations?: ExportCitationItem[];
}

export interface ExportWorkspaceMarkdownInput {
  title: string;
  date: Date;
  /**
   * Source workspace URL — ONLY populated if the exporter owns the workspace.
   */
  sourceUrl?: string | null;
  turns: ExportWorkspaceTurn[];
}

function escapeYamlString(val: string): string {
  const cleaned = val.replace(/[\r\n\0]/g, " ").trim();
  return `"${cleaned.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Formats a single response into Markdown with YAML front-matter and optional References list.
 * Never includes annotations, comments, other responses, or member names.
 */
export function exportResponseToMarkdown(input: ExportMarkdownInput): string {
  const frontMatterLines: string[] = [
    "---",
    `title: ${escapeYamlString(input.title || "Untitled Response")}`,
    `date: ${escapeYamlString(input.date.toISOString())}`,
  ];

  if (input.sourceUrl) {
    frontMatterLines.push(`source: ${escapeYamlString(input.sourceUrl)}`);
  }

  if (input.modelKey) {
    frontMatterLines.push(`model: ${escapeYamlString(input.modelKey)}`);
  }

  if (typeof input.versionNumber === "number") {
    frontMatterLines.push(`version: ${input.versionNumber}`);
  }

  frontMatterLines.push("---");

  const sections: string[] = [
    frontMatterLines.join("\n"),
    "",
    input.content.trim(),
  ];

  const sortedCitations = [...(input.citations || [])].sort(
    (a, b) => a.index - b.index
  );

  if (sortedCitations.length > 0) {
    sections.push("", "## References", "");
    for (const cit of sortedCitations) {
      const label = (cit.title || cit.url).replace(/[\r\n[\]]/g, " ").trim();
      sections.push(`${cit.index}. [${label}](${cit.url})`);
    }
  }

  return sections.join("\n") + "\n";
}

/**
 * Formats an entire workspace timeline into Markdown with YAML front-matter.
 * Never includes annotations, comments, or member names.
 */
export function exportWorkspaceToMarkdown(
  input: ExportWorkspaceMarkdownInput
): string {
  const frontMatterLines: string[] = [
    "---",
    `title: ${escapeYamlString(input.title || "Workspace Export")}`,
    `date: ${escapeYamlString(input.date.toISOString())}`,
  ];

  if (input.sourceUrl) {
    frontMatterLines.push(`source: ${escapeYamlString(input.sourceUrl)}`);
  }

  frontMatterLines.push("---");

  const sections: string[] = [
    frontMatterLines.join("\n"),
    "",
    `# ${input.title || "Workspace Export"}`,
  ];

  input.turns.forEach((turn, idx) => {
    sections.push("", "---", "");
    sections.push(`## Prompt ${idx + 1}`, "", turn.prompt.trim(), "");

    const metaParts: string[] = [];
    if (turn.modelKey) metaParts.push(`Model: ${turn.modelKey}`);
    if (typeof turn.versionNumber === "number") {
      metaParts.push(`v${turn.versionNumber}`);
    }
    if (turn.createdAt) {
      metaParts.push(turn.createdAt.toISOString());
    }

    sections.push(`### Response${metaParts.length > 0 ? ` (${metaParts.join(" · ")})` : ""}`, "");
    sections.push(turn.content.trim());

    const sortedCitations = [...(turn.citations || [])].sort(
      (a, b) => a.index - b.index
    );
    if (sortedCitations.length > 0) {
      sections.push("", "#### References", "");
      for (const cit of sortedCitations) {
        const label = (cit.title || cit.url).replace(/[\r\n[\]]/g, " ").trim();
        sections.push(`${cit.index}. [${label}](${cit.url})`);
      }
    }
  });

  return sections.join("\n") + "\n";
}
