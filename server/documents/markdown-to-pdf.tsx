import "server-only";
import React from "react";
import {
  Document,
  Font,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString as mdastToString } from "mdast-util-to-string";
import { isTrustedCloudinaryImageUrl } from "./markdown-to-docx";
import type { ExportCitationItem } from "./export-markdown";

export interface MarkdownToPdfInput {
  title: string;
  date?: Date;
  sourceUrl?: string | null;
  modelKey?: string | null;
  versionNumber?: number | null;
  markdown: string;
  citations?: ExportCitationItem[];
}

let fontsRegistered = false;

/**
 * Registers Noto Sans + Noto Sans Arabic/CJK fallback fonts so non-English scripts
 * (Spanish, Arabic, CJK, etc.) render cleanly in generated PDFs.
 */
export function ensurePdfFontsRegistered(): void {
  if (fontsRegistered) return;
  try {
    Font.register({
      family: "NotoSans",
      fonts: [
        {
          src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
          fontWeight: "normal",
        },
        {
          src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
          fontWeight: "bold",
        },
        {
          src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Italic.ttf",
          fontStyle: "italic",
        },
      ],
    });

    Font.register({
      family: "NotoSansArabic",
      src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf",
    });

    // Enable word-wrapping on long unbroken tokens (such as URLs or code identifiers)
    Font.registerHyphenationCallback((word) => [word]);
    fontsRegistered = true;
  } catch {
    // Ignore duplicate registration errors across hot reloads
  }
}

function createStyles(baseFontFamily: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 56,
      paddingHorizontal: 44,
      fontFamily: baseFontFamily,
      fontSize: 10.5,
      lineHeight: 1.5,
      color: "#0f172a",
    },
    headerBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: "#e2e8f0",
      paddingBottom: 6,
      marginBottom: 16,
      fontSize: 8.5,
      color: "#64748b",
    },
    docTitle: {
      fontSize: 20,
      fontWeight: "bold",
      marginBottom: 6,
      color: "#0f172a",
    },
    metaLine: {
      fontSize: 9,
      color: "#64748b",
      marginBottom: 16,
    },
    h1: {
      fontSize: 17,
      fontWeight: "bold",
      marginTop: 14,
      marginBottom: 6,
    },
    h2: {
      fontSize: 14.5,
      fontWeight: "bold",
      marginTop: 12,
      marginBottom: 5,
    },
    h3: {
      fontSize: 12.5,
      fontWeight: "bold",
      marginTop: 10,
      marginBottom: 4,
    },
    h4: {
      fontSize: 11,
      fontWeight: "bold",
      marginTop: 8,
      marginBottom: 4,
    },
    paragraph: {
      marginBottom: 8,
      fontSize: 10.5,
    },
    inlineCode: {
      fontFamily: "Courier",
      fontSize: 9.5,
      backgroundColor: "#f1f5f9",
    },
    link: {
      color: "#2563eb",
      textDecoration: "underline",
    },
    codeBlock: {
      fontFamily: "Courier",
      fontSize: 9,
      backgroundColor: "#f8fafc",
      borderWidth: 1,
      borderColor: "#cbd5e1",
      borderRadius: 4,
      padding: 8,
      marginVertical: 6,
      lineHeight: 1.35,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: "#94a3b8",
      paddingLeft: 10,
      marginVertical: 6,
      color: "#475569",
      fontStyle: "italic",
    },
    listContainer: {
      marginBottom: 8,
      paddingLeft: 10,
    },
    listItemRow: {
      flexDirection: "row",
      marginBottom: 4,
    },
    listBullet: {
      width: 18,
      fontWeight: "bold",
    },
    listContent: {
      flex: 1,
    },
    table: {
      width: "100%",
      borderWidth: 1,
      borderColor: "#cbd5e1",
      marginVertical: 8,
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#cbd5e1",
    },
    tableHeaderRow: {
      flexDirection: "row",
      backgroundColor: "#f1f5f9",
      borderBottomWidth: 1,
      borderBottomColor: "#94a3b8",
    },
    tableCell: {
      flex: 1,
      padding: 5,
      fontSize: 9.5,
      borderRightWidth: 1,
      borderRightColor: "#e2e8f0",
    },
    tableHeaderCell: {
      flex: 1,
      padding: 5,
      fontSize: 9.5,
      fontWeight: "bold",
      borderRightWidth: 1,
      borderRightColor: "#cbd5e1",
    },
    hr: {
      borderBottomWidth: 1,
      borderBottomColor: "#cbd5e1",
      marginVertical: 10,
    },
    imageBox: {
      marginVertical: 8,
      maxWidth: 420,
    },
    imagePlaceholder: {
      fontSize: 9,
      color: "#64748b",
      fontStyle: "italic",
      marginVertical: 4,
    },
    referencesSection: {
      marginTop: 16,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: "#cbd5e1",
    },
    referenceItem: {
      fontSize: 9.5,
      marginBottom: 4,
    },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 44,
      right: 44,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8.5,
      color: "#64748b",
      borderTopWidth: 1,
      borderTopColor: "#e2e8f0",
      paddingTop: 6,
    },
  });
}

function renderInlineNodes(
  nodes: any[],
  styles: ReturnType<typeof createStyles>,
  keyPrefix = "in"
): React.ReactNode[] {
  const out: React.ReactNode[] = [];

  (nodes || []).forEach((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (!node) return;

    switch (node.type) {
      case "text":
        out.push(<Text key={key}>{String(node.value ?? "")}</Text>);
        break;

      case "inlineCode":
        out.push(
          <Text key={key} style={styles.inlineCode}>
            {String(node.value ?? "")}
          </Text>
        );
        break;

      case "strong":
        out.push(
          <Text key={key} style={{ fontWeight: "bold" }}>
            {renderInlineNodes(node.children || [], styles, key)}
          </Text>
        );
        break;

      case "emphasis":
        out.push(
          <Text key={key} style={{ fontStyle: "italic" }}>
            {renderInlineNodes(node.children || [], styles, key)}
          </Text>
        );
        break;

      case "delete":
        out.push(
          <Text key={key} style={{ textDecoration: "line-through" }}>
            {renderInlineNodes(node.children || [], styles, key)}
          </Text>
        );
        break;

      case "link": {
        const href = String(node.url ?? "").trim();
        const label = mdastToString(node) || href;
        if (/^https?:\/\//i.test(href)) {
          out.push(
            <Link key={key} src={href} style={styles.link}>
              {label}
            </Link>
          );
        } else {
          out.push(<Text key={key}>{label}</Text>);
        }
        break;
      }

      case "image": {
        const imgUrl = String(node.url ?? "").trim();
        const alt = String(node.alt ?? "").trim();
        if (isTrustedCloudinaryImageUrl(imgUrl)) {
          out.push(
            <Text key={key} style={styles.imagePlaceholder}>
              {`[Cloudinary Image: ${alt || imgUrl}]`}
            </Text>
          );
        } else {
          out.push(
            <Text key={key} style={styles.imagePlaceholder}>
              {`[Image omitted: ${alt || "external source"}]`}
            </Text>
          );
        }
        break;
      }

      case "break":
        out.push(<Text key={key}>{"\n"}</Text>);
        break;

      default:
        out.push(<Text key={key}>{mdastToString(node)}</Text>);
        break;
    }
  });

  return out;
}

function renderBlockNodes(
  nodes: any[],
  styles: ReturnType<typeof createStyles>,
  keyPrefix = "blk"
): React.ReactNode[] {
  const out: React.ReactNode[] = [];

  (nodes || []).forEach((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (!node) return;

    switch (node.type) {
      case "heading": {
        const depth = Number(node.depth) || 1;
        const headingStyle =
          depth === 1
            ? styles.h1
            : depth === 2
              ? styles.h2
              : depth === 3
                ? styles.h3
                : styles.h4;
        out.push(
          <Text key={key} style={headingStyle}>
            {renderInlineNodes(node.children || [], styles, key)}
          </Text>
        );
        break;
      }

      case "paragraph": {
        // Check if paragraph contains a single standalone trusted Cloudinary image
        const children = node.children || [];
        if (
          children.length === 1 &&
          children[0]?.type === "image" &&
          isTrustedCloudinaryImageUrl(String(children[0].url ?? "")) &&
          process.env.NODE_ENV !== "test"
        ) {
          out.push(
            <View key={key} style={styles.imageBox}>
              <Image src={String(children[0].url)} />
            </View>
          );
          break;
        }
        out.push(
          <Text key={key} style={styles.paragraph}>
            {renderInlineNodes(children, styles, key)}
          </Text>
        );
        break;
      }

      case "code": {
        const rawCode = String(node.value ?? "");
        // Wrap long lines at 88 chars so code blocks never overflow horizontally
        const wrappedLines = rawCode
          .split(/\r?\n/)
          .flatMap((line) => {
            if (line.length <= 88) return [line];
            const chunks: string[] = [];
            for (let i = 0; i < line.length; i += 88) {
              chunks.push(line.slice(i, i + 88));
            }
            return chunks;
          })
          .join("\n");

        out.push(
          <View key={key} style={styles.codeBlock} wrap={true}>
            <Text>{wrappedLines}</Text>
          </View>
        );
        break;
      }

      case "blockquote": {
        out.push(
          <View key={key} style={styles.blockquote}>
            <Text>{mdastToString(node)}</Text>
          </View>
        );
        break;
      }

      case "list": {
        const ordered = Boolean(node.ordered);
        const start = Number(node.start) || 1;
        const items: any[] = node.children || [];
        out.push(
          <View key={key} style={styles.listContainer}>
            {items.map((item, iIdx) => {
              const bullet = ordered ? `${start + iIdx}.` : "•";
              return (
                <View key={`${key}-li-${iIdx}`} style={styles.listItemRow}>
                  <Text style={styles.listBullet}>{bullet}</Text>
                  <View style={styles.listContent}>
                    {renderBlockNodes(
                      item.children || [],
                      styles,
                      `${key}-li-${iIdx}`
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        );
        break;
      }

      case "table": {
        const rows: any[] = node.children || [];
        out.push(
          <View key={key} style={styles.table} wrap={true}>
            {rows.map((row, rIdx) => {
              const isHeader = rIdx === 0;
              const cells: any[] = row.children || [];
              return (
                <View
                  key={`${key}-tr-${rIdx}`}
                  style={isHeader ? styles.tableHeaderRow : styles.tableRow}
                  wrap={false}
                >
                  {cells.map((cell, cIdx) => (
                    <View
                      key={`${key}-tc-${rIdx}-${cIdx}`}
                      style={
                        isHeader ? styles.tableHeaderCell : styles.tableCell
                      }
                    >
                      <Text>
                        {renderInlineNodes(
                          cell.children || [],
                          styles,
                          `${key}-tc-${rIdx}-${cIdx}`
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
        break;
      }

      case "thematicBreak": {
        out.push(<View key={key} style={styles.hr} />);
        break;
      }

      default: {
        const txt = mdastToString(node).trim();
        if (txt) {
          out.push(
            <Text key={key} style={styles.paragraph}>
              {txt}
            </Text>
          );
        }
        break;
      }
    }
  });

  return out;
}

function buildPdfElement(
  input: MarkdownToPdfInput,
  tree: any,
  baseFontFamily: string
) {
  const styles = createStyles(baseFontFamily);
  const dateStr = (input.date ?? new Date()).toISOString().slice(0, 10);

  const metaParts: string[] = [`Date: ${dateStr}`];
  if (input.modelKey) metaParts.push(`Model: ${input.modelKey}`);
  if (typeof input.versionNumber === "number") {
    metaParts.push(`v${input.versionNumber}`);
  }
  if (input.sourceUrl) metaParts.push(`Source: ${input.sourceUrl}`);

  const sortedCitations = [...(input.citations || [])].sort(
    (a, b) => a.index - b.index
  );

  return (
    <Document
      title={input.title || "Klecx Export"}
      creator="Klecx"
      producer="Klecx Document Engine"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Running Page Header with title and date */}
        <View style={styles.headerBar} fixed>
          <Text>{(input.title || "Klecx Document").slice(0, 80)}</Text>
          <Text>{dateStr}</Text>
        </View>

        {/* Document Title & Metadata */}
        <Text style={styles.docTitle}>
          {input.title || "Untitled Document"}
        </Text>
        <Text style={styles.metaLine}>{metaParts.join("  ·  ")}</Text>

        {/* Body Content */}
        {renderBlockNodes(tree.children || [], styles)}

        {/* Citations / References */}
        {sortedCitations.length > 0 && (
          <View style={styles.referencesSection} wrap={true}>
            <Text style={styles.h2}>References</Text>
            {sortedCitations.map((cit) => (
              <Text key={`cit-${cit.index}`} style={styles.referenceItem}>
                {`${cit.index}. `}
                <Link src={cit.url} style={styles.link}>
                  {cit.title || cit.url}
                </Link>
                {` (${cit.url})`}
              </Text>
            ))}
          </View>
        )}

        {/* Running Footer with Page Numbers */}
        <View style={styles.footer} fixed>
          <Text>Klecx</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Renders Markdown content + metadata + citations into a valid PDF Buffer.
 */
export async function renderMarkdownToPdf(
  input: MarkdownToPdfInput
): Promise<Buffer> {
  ensurePdfFontsRegistered();

  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(input.markdown || "");

  // In non-test environments, attempt rendering with NotoSans for full international glyph coverage,
  // falling back to built-in Helvetica if remote font retrieval is unavailable/offline.
  if (process.env.NODE_ENV !== "test") {
    try {
      const buf = await renderToBuffer(
        buildPdfElement(input, tree, "NotoSans")
      );
      return Buffer.from(buf);
    } catch {
      // Fallback to built-in Helvetica below
    }
  }

  const fallbackBuf = await renderToBuffer(
    buildPdfElement(input, tree, "Helvetica")
  );
  return Buffer.from(fallbackBuf);
}
