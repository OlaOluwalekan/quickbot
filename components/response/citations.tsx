"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CitationDto } from "@/lib/api/sse";

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function extractHostname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export interface CitationMarkerPopoverProps {
  citation: CitationDto;
}

export function CitationMarkerPopover({
  citation,
}: CitationMarkerPopoverProps) {
  if (!isValidHttpUrl(citation.url)) {
    return <span>[{citation.index}]</span>;
  }

  const hostname = extractHostname(citation.url);
  const displayTitle = citation.title?.trim() || hostname || citation.url;
  const faviconSrc = hostname
    ? `/api/v1/favicon?host=${encodeURIComponent(hostname)}`
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`citation-marker-${citation.index}`}
          aria-label={`Source ${citation.index}: ${displayTitle}`}
          className="bg-accent-soft text-accent border-accent/30 hover:bg-accent hover:text-accent-fg mx-0.5 inline-flex h-4 min-w-4 cursor-pointer items-center justify-center rounded border px-1 align-baseline font-mono text-[10px] leading-none font-semibold transition-colors"
        >
          [{citation.index}]
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="border-border bg-surface text-fg w-72 space-y-2 rounded-xl border p-3 shadow-lg"
      >
        <div className="flex items-center gap-2 text-xs">
          {faviconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconSrc}
              alt=""
              width={14}
              height={14}
              className="h-3.5 w-3.5 shrink-0 rounded-2xs object-contain"
            />
          ) : (
            <Globe className="text-fg-muted h-3.5 w-3.5 shrink-0" />
          )}
          <span className="text-fg-muted truncate font-mono text-[11px]">
            {hostname}
          </span>
          <span className="bg-surface-2 text-fg-muted ml-auto rounded px-1.5 py-0.5 font-mono text-[10px]">
            [{citation.index}]
          </span>
        </div>

        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-fg hover:text-accent group/cit flex items-start justify-between gap-1.5 text-xs font-semibold leading-snug hover:underline"
        >
          <span className="line-clamp-2">{displayTitle}</span>
          <ExternalLink className="text-fg-muted group-hover/cit:text-accent mt-0.5 h-3 w-3 shrink-0" />
        </a>

        {citation.snippet && (
          <p className="text-fg-muted border-border/60 line-clamp-3 border-t pt-1.5 text-[11px] leading-relaxed">
            {citation.snippet}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface SourcesAccordionProps {
  citations?: CitationDto[] | null;
  label?: string;
  defaultOpen?: boolean;
  className?: string;
}

export function SourcesAccordion({
  citations,
  label = "Sources",
  defaultOpen = false,
  className,
}: SourcesAccordionProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  const validCitations = React.useMemo(() => {
    if (!citations || citations.length === 0) return [];
    return citations
      .filter((c) => isValidHttpUrl(c.url))
      .sort((a, b) => a.index - b.index);
  }, [citations]);

  if (validCitations.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="response-sources"
      className={cn(
        "border-border/60 bg-surface-2/50 rounded-xl border text-xs",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        data-testid="response-sources-toggle"
        className="text-fg-muted hover:text-fg flex w-full cursor-pointer items-center justify-between px-3 py-2 font-medium transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="text-accent h-3.5 w-3.5" />
          <span>
            {label} ({validCitations.length})
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div
          data-testid="response-sources-list"
          className="border-border/50 divide-border/40 divide-y border-t px-3 py-1.5"
        >
          {validCitations.map((cit) => {
            const hostname = extractHostname(cit.url);
            const displayTitle = cit.title?.trim() || hostname || cit.url;
            const faviconSrc = hostname
              ? `/api/v1/favicon?host=${encodeURIComponent(hostname)}`
              : null;

            return (
              <div key={`${cit.index}-${cit.url}`} className="py-2">
                <a
                  href={cit.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  data-testid={`source-link-${cit.index}`}
                  className="group/src flex items-start gap-2.5"
                >
                  <span className="bg-accent-soft text-accent border-accent/30 mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 font-mono text-[10px] font-semibold">
                    [{cit.index}]
                  </span>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      {faviconSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={faviconSrc}
                          alt=""
                          width={14}
                          height={14}
                          className="h-3.5 w-3.5 shrink-0 rounded-2xs object-contain"
                        />
                      ) : (
                        <Globe className="text-fg-muted h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="text-fg group-hover/src:text-accent truncate font-medium group-hover/src:underline">
                        {displayTitle}
                      </span>
                      <span className="text-fg-muted shrink-0 font-mono text-[10px]">
                        · {hostname}
                      </span>
                      <ExternalLink className="text-fg-muted group-hover/src:text-accent ml-auto h-3 w-3 shrink-0" />
                    </div>

                    {cit.snippet && (
                      <p className="text-fg-muted line-clamp-2 text-[11px] leading-relaxed">
                        {cit.snippet}
                      </p>
                    )}
                  </div>
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
