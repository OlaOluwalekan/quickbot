import "server-only";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString as mdastToString } from "mdast-util-to-string";
import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { env } from "@/server/env";
import { safeFetch } from "@/server/files/safe-fetch";
import type { ExportCitationItem } from "./export-markdown";

export interface MarkdownToDocxInput {
  title: string;
  date?: Date;
  sourceUrl?: string | null;
  modelKey?: string | null;
  versionNumber?: number | null;
  markdown: string;
  citations?: ExportCitationItem[];
}

interface InlineFormatting {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

/**
 * Verifies whether an image URL belongs strictly to our configured Cloudinary cloud.
 * Arbitrary third-party image URLs are never fetched or embedded in exports.
 */
export function isTrustedCloudinaryImageUrl(rawUrl: string): boolean {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname.toLowerCase() !== "res.cloudinary.com") return false;
    const prefix = `/${cloudName.toLowerCase()}/`;
    return parsed.pathname.toLowerCase().startsWith(prefix);
  } catch {
    return false;
  }
}

function mapHeadingLevel(depth: number) {
  switch (depth) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    case 4:
      return HeadingLevel.HEADING_4;
    case 5:
      return HeadingLevel.HEADING_5;
    default:
      return HeadingLevel.HEADING_6;
  }
}

async function mapInlineNodesToChildren(
  nodes: any[],
  fmt: InlineFormatting = {}
): Promise<ParagraphChild[]> {
  const children: ParagraphChild[] = [];

  for (const node of nodes || []) {
    if (!node) continue;

    switch (node.type) {
      case "text": {
        children.push(
          new TextRun({
            text: String(node.value ?? ""),
            bold: fmt.bold,
            italics: fmt.italics,
            strike: fmt.strike,
            font: fmt.code ? "Courier New" : undefined,
          })
        );
        break;
      }

      case "inlineCode": {
        children.push(
          new TextRun({
            text: String(node.value ?? ""),
            font: "Courier New",
            bold: fmt.bold,
            italics: fmt.italics,
            shading: {
              type: ShadingType.CLEAR,
              fill: "F1F5F9",
            },
          })
        );
        break;
      }

      case "strong": {
        const inner = await mapInlineNodesToChildren(node.children || [], {
          ...fmt,
          bold: true,
        });
        children.push(...inner);
        break;
      }

      case "emphasis": {
        const inner = await mapInlineNodesToChildren(node.children || [], {
          ...fmt,
          italics: true,
        });
        children.push(...inner);
        break;
      }

      case "delete": {
        const inner = await mapInlineNodesToChildren(node.children || [], {
          ...fmt,
          strike: true,
        });
        children.push(...inner);
        break;
      }

      case "break": {
        children.push(new TextRun({ text: "", break: 1 }));
        break;
      }

      case "link": {
        const rawHref = String(node.url ?? "").trim();
        const linkText = mdastToString(node) || rawHref;
        const isSafeHttp = /^https?:\/\//i.test(rawHref);
        if (isSafeHttp) {
          children.push(
            new ExternalHyperlink({
              link: rawHref,
              children: [
                new TextRun({
                  text: linkText,
                  style: "Hyperlink",
                  color: "2563EB",
                  underline: {},
                  bold: fmt.bold,
                  italics: fmt.italics,
                }),
              ],
            })
          );
        } else {
          children.push(
            new TextRun({
              text: linkText,
              bold: fmt.bold,
              italics: fmt.italics,
            })
          );
        }
        break;
      }

      case "image": {
        const imgUrl = String(node.url ?? "").trim();
        const alt = String(node.alt ?? "").trim();
        if (isTrustedCloudinaryImageUrl(imgUrl)) {
          try {
            const fetched = await safeFetch(imgUrl, {
              totalTimeoutMs: 4000,
              maxBytes: 5 * 1024 * 1024,
              allowedMimes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
            });
            const ct = fetched.mime.toLowerCase();
            const imgType: "png" | "jpg" | "gif" | "bmp" = ct.includes("jpeg") || ct.includes("jpg")
              ? "jpg"
              : ct.includes("gif")
                ? "gif"
                : "png";
            children.push(
              new ImageRun({
                type: imgType,
                data: fetched.buffer,
                transformation: { width: 420, height: 280 },
              })
            );
            break;
          } catch {
            // Fall through to text placeholder if network/offline in tests
          }
          children.push(
            new TextRun({
              text: `[Image: ${alt || imgUrl}]`,
              italics: true,
              color: "475569",
            })
          );
        } else {
          // Never fetch non-Cloudinary image URLs
          children.push(
            new TextRun({
              text: `[Image omitted: ${alt || "external source"}]`,
              italics: true,
              color: "64748B",
            })
          );
        }
        break;
      }

      default: {
        if (Array.isArray(node.children)) {
          const inner = await mapInlineNodesToChildren(node.children, fmt);
          children.push(...inner);
        } else if (typeof node.value === "string") {
          children.push(
            new TextRun({
              text: node.value,
              bold: fmt.bold,
              italics: fmt.italics,
            })
          );
        }
        break;
      }
    }
  }

  return children;
}

async function mapBlockNodes(
  nodes: any[],
  indentLevel = 0
): Promise<Array<Paragraph | Table>> {
  const out: Array<Paragraph | Table> = [];

  for (const node of nodes || []) {
    if (!node) continue;

    switch (node.type) {
      case "heading": {
        const depth = Math.min(Math.max(Number(node.depth) || 1, 1), 6);
        const children = await mapInlineNodesToChildren(node.children || []);
        out.push(
          new Paragraph({
            heading: mapHeadingLevel(depth),
            children:
              children.length > 0
                ? children
                : [new TextRun({ text: mdastToString(node) })],
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }

      case "paragraph": {
        const children = await mapInlineNodesToChildren(node.children || []);
        out.push(
          new Paragraph({
            children,
            spacing: { after: 160 },
            ...(indentLevel > 0
              ? { indent: { left: indentLevel * 360 } }
              : {}),
          })
        );
        break;
      }

      case "code": {
        const codeText = String(node.value ?? "");
        const lines = codeText.split(/\r?\n/);
        const runs: ParagraphChild[] = [];
        lines.forEach((line, idx) => {
          runs.push(
            new TextRun({
              text: line,
              font: "Courier New",
              size: 20, // 10pt
              ...(idx > 0 ? { break: 1 } : {}),
            })
          );
        });
        out.push(
          new Paragraph({
            children: runs,
            spacing: { before: 120, after: 160 },
            shading: {
              type: ShadingType.CLEAR,
              fill: "F8FAFC",
            },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
            },
          })
        );
        break;
      }

      case "blockquote": {
        const quoteText = mdastToString(node);
        out.push(
          new Paragraph({
            children: [
              new TextRun({
                text: quoteText,
                italics: true,
                color: "475569",
              }),
            ],
            indent: { left: 480 },
            spacing: { before: 120, after: 160 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: "94A3B8" },
            },
          })
        );
        break;
      }

      case "list": {
        const ordered = Boolean(node.ordered);
        const start = Number(node.start) || 1;
        const items: any[] = node.children || [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const prefix = ordered ? `${start + i}. ` : "• ";
          const itemChildren: ParagraphChild[] = [
            new TextRun({ text: prefix, bold: ordered }),
          ];

          for (const child of item.children || []) {
            if (child.type === "paragraph") {
              const inline = await mapInlineNodesToChildren(
                child.children || []
              );
              itemChildren.push(...inline);
            } else if (child.type === "list") {
              // Flush current item paragraph if any, then nested list
              if (itemChildren.length > 0) {
                out.push(
                  new Paragraph({
                    children: [...itemChildren],
                    indent: { left: (indentLevel + 1) * 360 },
                    spacing: { after: 80 },
                  })
                );
                itemChildren.length = 0;
              }
              const nested = await mapBlockNodes([child], indentLevel + 1);
              out.push(...nested);
            } else {
              itemChildren.push(
                new TextRun({ text: mdastToString(child) })
              );
            }
          }

          if (itemChildren.length > 0) {
            out.push(
              new Paragraph({
                children: itemChildren,
                indent: { left: (indentLevel + 1) * 360 },
                spacing: { after: 80 },
              })
            );
          }
        }
        break;
      }

      case "table": {
        const rows: any[] = node.children || [];
        const tableRows: TableRow[] = [];

        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
          const rowNode = rows[rIdx];
          const cells: any[] = rowNode.children || [];
          const isHeader = rIdx === 0;
          const tableCells: TableCell[] = [];

          for (const cellNode of cells) {
            const inline = await mapInlineNodesToChildren(
              cellNode.children || [],
              { bold: isHeader }
            );
            tableCells.push(
              new TableCell({
                children: [
                  new Paragraph({
                    children:
                      inline.length > 0
                        ? inline
                        : [
                            new TextRun({
                              text: mdastToString(cellNode),
                              bold: isHeader,
                            }),
                          ],
                  }),
                ],
                shading: isHeader
                  ? { type: ShadingType.CLEAR, fill: "F1F5F9" }
                  : undefined,
              })
            );
          }

          if (tableCells.length > 0) {
            tableRows.push(new TableRow({ children: tableCells }));
          }
        }

        if (tableRows.length > 0) {
          out.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: tableRows,
            })
          );
          out.push(new Paragraph({ text: "", spacing: { after: 120 } }));
        }
        break;
      }

      case "thematicBreak": {
        out.push(
          new Paragraph({
            text: "",
            spacing: { before: 160, after: 160 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
            },
          })
        );
        break;
      }

      default: {
        const text = mdastToString(node).trim();
        if (text) {
          out.push(
            new Paragraph({
              children: [new TextRun({ text })],
              spacing: { after: 120 },
            })
          );
        }
        break;
      }
    }
  }

  return out;
}

/**
 * Renders Markdown content + metadata + citations into a valid .docx Buffer.
 */
export async function renderMarkdownToDocx(
  input: MarkdownToDocxInput
): Promise<Buffer> {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(input.markdown || "");

  const children: Array<Paragraph | Table> = [];

  // Title header
  if (input.title) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: input.title, bold: true })],
        spacing: { after: 120 },
      })
    );
  }

  // Metadata subtitle line
  const metaItems: string[] = [];
  if (input.date) {
    metaItems.push(`Date: ${input.date.toISOString().slice(0, 10)}`);
  }
  if (input.modelKey) {
    metaItems.push(`Model: ${input.modelKey}`);
  }
  if (typeof input.versionNumber === "number") {
    metaItems.push(`Version: v${input.versionNumber}`);
  }
  if (input.sourceUrl) {
    metaItems.push(`Source: ${input.sourceUrl}`);
  }

  if (metaItems.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: metaItems.join("  |  "),
            color: "64748B",
            size: 18,
          }),
        ],
        spacing: { after: 240 },
      })
    );
  }

  const bodyBlocks = await mapBlockNodes((tree as any).children || []);
  children.push(...bodyBlocks);

  // Citations / References section
  const sortedCitations = [...(input.citations || [])].sort(
    (a, b) => a.index - b.index
  );
  if (sortedCitations.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "References", bold: true })],
        spacing: { before: 280, after: 120 },
      })
    );

    for (const cit of sortedCitations) {
      const label = (cit.title || cit.url).trim();
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${cit.index}. `, bold: true }),
            new ExternalHyperlink({
              link: cit.url,
              children: [
                new TextRun({
                  text: `${label} (${cit.url})`,
                  style: "Hyperlink",
                  color: "2563EB",
                  underline: {},
                }),
              ],
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
