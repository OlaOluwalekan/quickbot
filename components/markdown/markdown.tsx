"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { PluggableList } from "unified";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { SafeLink } from "./safe-link";
import { SafeImage } from "./safe-image";
import { DocumentImage } from "./document-image";
import { CodeBlock, InlineCode } from "./code-block";
import {
  ScrollTable,
  ScrollTableHead,
  ScrollTableTh,
  ScrollTableCell,
} from "./scroll-table";
import { CitationMarkerPopover } from "@/components/response/citations";
import type { CitationDto } from "@/lib/api/sse";

export interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
  citations?: CitationDto[] | null;
  className?: string;
  /**
   * "document": the text of an uploaded document. HTML written inside the
   * Markdown is rendered (after sanitizing) and images that can't be shown
   * become a placeholder box with their description. AI answers keep the
   * default: HTML stays text.
   */
  variant?: MarkdownVariant;
}

export type MarkdownVariant = "answer" | "document";

const ANSWER_REHYPE_PLUGINS: PluggableList = [rehypeKatex];

/**
 * Raw HTML is parsed, then cleaned with the GitHub allow-list (no scripts,
 * styles, iframes, event handlers or `javascript:` links), then formulas are
 * rendered. The formula classes are allowed so that step still finds them.
 */
const DOCUMENT_REHYPE_PLUGINS: PluggableList = [
  rehypeRaw,
  [
    rehypeSanitize,
    {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        code: [
          ...(defaultSchema.attributes?.code ?? []),
          ["className", /^language-./, "math-inline", "math-display"],
        ],
      },
    },
  ],
  rehypeKatex,
];

function rehypePluginsFor(variant: MarkdownVariant): PluggableList {
  return variant === "document" ? DOCUMENT_REHYPE_PLUGINS : ANSWER_REHYPE_PLUGINS;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function getNodeText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(getNodeText).join("");
  if (React.isValidElement(children)) {
    return getNodeText((children.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function replaceTextCitationMarkers(
  node: React.ReactNode,
  citationsByIndex: Map<number, CitationDto>
): React.ReactNode {
  if (citationsByIndex.size === 0) return node;

  if (typeof node === "string") {
    const parts = node.split(/(\[\d+\])/g);
    if (parts.length === 1) return node;

    return parts.map((part, i) => {
      const match = /^\[(\d+)\]$/.exec(part);
      if (match) {
        const idx = Number.parseInt(match[1]!, 10);
        const cit = citationsByIndex.get(idx);
        if (cit) {
          return <CitationMarkerPopover key={`cit-${idx}-${i}`} citation={cit} />;
        }
      }
      return part;
    });
  }

  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <React.Fragment key={idx}>
        {replaceTextCitationMarkers(child, citationsByIndex)}
      </React.Fragment>
    ));
  }

  return node;
}

/**
 * react-markdown gives every custom component a `node` prop (the parsed
 * element). None of ours uses it, and they pass the props they don't know on
 * to the HTML element, where it showed up as `node="[object Object]"` on every
 * heading, paragraph, list, link, table and code block. It is dropped here.
 */
function withoutNode<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P & { node?: unknown }> {
  function MarkdownElement(props: P & { node?: unknown }) {
    const rest: Record<string, unknown> = { ...props };
    delete rest.node;
    return <Component {...(rest as P)} />;
  }
  return MarkdownElement;
}

function createMarkdownComponents(
  citationsByIndex: Map<number, CitationDto>,
  variant: MarkdownVariant
): Components {
  const components = {
    a: SafeLink,
    img: variant === "document" ? DocumentImage : SafeImage,
    pre: CodeBlock,
    code: ({
      inline,
      className,
      children,
      ...props
    }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
      // If inline or no language class, render clean InlineCode
      if (inline || !className?.includes("language-")) {
        return (
          <InlineCode className={className} {...props}>
            {children}
          </InlineCode>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    table: ScrollTable,
    thead: ScrollTableHead,
    th: ScrollTableTh,
    td: ScrollTableCell,
    h1: ({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = getNodeText(children);
      const id = slugify(text);
      return (
        <h1
          id={id}
          className={cn(
            "text-xl sm:text-2xl font-bold tracking-tight text-fg mt-6 mb-3 scroll-mt-16 group/heading",
            className
          )}
          {...props}
        >
          <a href={`#${id}`} className="hover:underline">
            {children}
          </a>
        </h1>
      );
    },
    h2: ({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = getNodeText(children);
      const id = slugify(text);
      return (
        <h2
          id={id}
          className={cn(
            "text-lg sm:text-xl font-semibold tracking-tight text-fg mt-5 mb-2.5 scroll-mt-16 group/heading",
            className
          )}
          {...props}
        >
          <a href={`#${id}`} className="hover:underline">
            {children}
          </a>
        </h2>
      );
    },
    h3: ({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = getNodeText(children);
      const id = slugify(text);
      return (
        <h3
          id={id}
          className={cn(
            "text-base sm:text-lg font-semibold text-fg mt-4 mb-2 scroll-mt-16 group/heading",
            className
          )}
          {...props}
        >
          <a href={`#${id}`} className="hover:underline">
            {children}
          </a>
        </h3>
      );
    },
    h4: ({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => {
      const text = getNodeText(children);
      const id = slugify(text);
      return (
        <h4
          id={id}
          className={cn(
            "text-sm sm:text-base font-semibold text-fg mt-3 mb-1.5 scroll-mt-16 group/heading",
            className
          )}
          {...props}
        >
          <a href={`#${id}`} className="hover:underline">
            {children}
          </a>
        </h4>
      );
    },
    blockquote: ({ children, className, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
      <blockquote
        className={cn(
          "my-3 pl-4 border-l-3 border-accent/70 italic text-fg-muted bg-surface-2/40 py-1.5 rounded-r-lg",
          className
        )}
        {...props}
      >
        {children}
      </blockquote>
    ),
    ul: ({ children, className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
      <ul className={cn("my-2.5 pl-6 list-disc space-y-1.5 leading-relaxed text-fg", className)} {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, className, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
      <ol className={cn("my-2.5 pl-6 list-decimal space-y-1.5 leading-relaxed text-fg", className)} {...props}>
        {children}
      </ol>
    ),
    li: ({ children, className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
      <li className={cn("leading-relaxed", className)} {...props}>
        {replaceTextCitationMarkers(children, citationsByIndex)}
      </li>
    ),
    input: ({ type, checked, disabled, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
      if (type === "checkbox") {
        return (
          <input
            type="checkbox"
            checked={checked}
            disabled={true}
            readOnly
            className="mr-2 h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent align-middle"
            {...props}
          />
        );
      }
      return <input type={type} disabled={disabled} {...props} />;
    },
    hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
      <hr className="my-5 border-border/70" {...props} />
    ),
    p: ({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p className={cn("my-2 leading-relaxed text-fg select-text", className)} {...props}>
        {replaceTextCitationMarkers(children, citationsByIndex)}
      </p>
    ),
  };

  return Object.fromEntries(
    Object.entries(components).map(([tag, Component]) => [
      tag,
      withoutNode(Component as React.ComponentType<object>),
    ])
  ) as Components;
}

/**
 * Memoized block unit for streaming performance.
 * Finished blocks do not re-render as new deltas stream into the tail block.
 */
interface MemoizedBlockProps {
  blockText: string;
  components: ReturnType<typeof createMarkdownComponents>;
  variant: MarkdownVariant;
}

function safeUrlTransform(url: string): string {
  if (/^(https?:|mailto:|tel:|#|\/|blob:|data:image\/)/i.test(url)) {
    return url;
  }
  return "";
}

const MemoizedMarkdownBlock = React.memo(
  function MemoizedMarkdownBlock({ blockText, components, variant }: MemoizedBlockProps) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePluginsFor(variant)}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {blockText}
      </ReactMarkdown>
    );
  },
  (prev, next) =>
    prev.blockText === next.blockText &&
    prev.components === next.components &&
    prev.variant === next.variant
);

export function Markdown({
  content,
  isStreaming = false,
  citations,
  className,
  variant = "answer",
}: MarkdownProps) {
  const citationsByIndex = React.useMemo(() => {
    const map = new Map<number, CitationDto>();
    if (citations) {
      for (const cit of citations) {
        map.set(cit.index, cit);
      }
    }
    return map;
  }, [citations]);

  const components = React.useMemo(
    () => createMarkdownComponents(citationsByIndex, variant),
    [citationsByIndex, variant]
  );

  // If not streaming or short text, render single pass
  if (!isStreaming || content.length < 500) {
    return (
      <div className={cn("text-sm sm:text-base leading-relaxed text-fg space-y-2 select-text", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={rehypePluginsFor(variant)}
          urlTransform={safeUrlTransform}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // Streaming optimization: split into top-level blocks by blank lines
  // Completed blocks are memoized; only the last block re-renders per delta
  const blocks = content.split(/\n\n+/);

  return (
    <div className={cn("text-sm sm:text-base leading-relaxed text-fg space-y-2 select-text", className)}>
      {blocks.map((block, idx) => (
        <MemoizedMarkdownBlock
          key={idx}
          blockText={block}
          components={components}
          variant={variant}
        />
      ))}
    </div>
  );
}

export default Markdown;
