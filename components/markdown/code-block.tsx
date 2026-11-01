"use client";

import * as React from "react";
import { Check, Copy, WrapText } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Cache for shiki highlighter instance
let shikiHighlighterPromise: Promise<any> | null = null;

async function getHighlighterInstance() {
  if (!shikiHighlighterPromise) {
    shikiHighlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-light", "github-dark"],
        langs: [
          "javascript",
          "typescript",
          "jsx",
          "tsx",
          "html",
          "css",
          "json",
          "python",
          "bash",
          "shell",
          "sql",
          "yaml",
          "markdown",
          "go",
          "rust",
        ],
      })
    );
  }
  return shikiHighlighterPromise;
}

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children?: React.ReactNode;
  className?: string;
}

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [isWrapped, setIsWrapped] = React.useState(false);
  const [highlightedHtml, setHighlightedHtml] = React.useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  // Extract raw text and language from the inner <code> child
  const { codeText, language } = React.useMemo(() => {
    let rawText = "";
    let lang = "";

    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        const childProps = child.props as { className?: string; children?: React.ReactNode };
        if (childProps.className) {
          const match = /language-([a-zA-Z0-9_-]+)/.exec(childProps.className);
          if (match && match[1]) {
            lang = match[1].toLowerCase();
          }
        }
        if (typeof childProps.children === "string") {
          rawText += childProps.children;
        } else if (Array.isArray(childProps.children)) {
          rawText += childProps.children.join("");
        }
      } else if (typeof child === "string") {
        rawText += child;
      }
    });

    return {
      codeText: rawText.replace(/\n$/, ""),
      language: lang || "text",
    };
  }, [children]);

  // Lazy highlight with Shiki once mounted / closed
  React.useEffect(() => {
    let isCancelled = false;

    // Check if block has closed code text
    if (!codeText) return;

    const theme = resolvedTheme === "dark" ? "github-dark" : "github-light";

    getHighlighterInstance()
      .then((highlighter) => {
        if (isCancelled) return;
        try {
          const loadedLangs = highlighter.getLoadedLanguages();
          const targetLang = loadedLangs.includes(language) ? language : "text";

          const html = highlighter.codeToHtml(codeText, {
            lang: targetLang,
            theme,
          });

          // Strip <pre> wrapper from shiki output so our wrapper controls styling
          const innerMatch = /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/.exec(html);
          if (innerMatch && innerMatch[1]) {
            setHighlightedHtml(innerMatch[1]);
          } else {
            setHighlightedHtml(html);
          }
        } catch {
          // Fallback to plain text
          setHighlightedHtml(null);
        }
      })
      .catch(() => {
        // Fallback
        setHighlightedHtml(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [codeText, language, resolvedTheme]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="my-4 rounded-xl border border-border bg-surface-2 overflow-hidden shadow-2xs group/code text-left">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-border/70 bg-surface text-xs font-mono text-fg-muted select-none">
        <span className="font-semibold text-fg/80 capitalize">{language}</span>

        <div className="flex items-center gap-1.5">
          {/* Wrap toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsWrapped(!isWrapped)}
            title={isWrapped ? "Disable line wrap" : "Enable line wrap"}
            className={cn(
              "h-6 px-1.5 text-[11px] text-fg-muted hover:text-fg",
              isWrapped && "text-accent bg-accent-soft"
            )}
          >
            <WrapText className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">{isWrapped ? "Unwrap" : "Wrap"}</span>
          </Button>

          {/* Copy button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy code"}
            className="h-6 px-1.5 text-[11px] text-fg-muted hover:text-fg"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 mr-1 text-accent" />
                <span className="text-accent font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 mr-1" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Code Body */}
      <pre
        className={cn(
          "p-4 text-xs sm:text-sm font-mono leading-relaxed overflow-x-auto text-fg",
          isWrapped ? "whitespace-pre-wrap break-words" : "whitespace-pre",
          className
        )}
        {...props}
      >
        {highlightedHtml ? (
          <code
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            className="font-mono"
          />
        ) : (
          <code className="font-mono">{codeText}</code>
        )}
      </pre>
    </div>
  );
}

export function InlineCode({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "px-1.5 py-0.5 rounded-md font-mono text-[13px] bg-surface-2 border border-border text-fg font-medium",
        className
      )}
      {...props}
    >
      {children}
    </code>
  );
}
