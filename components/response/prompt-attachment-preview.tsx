"use client";

import * as React from "react";
import {
  FileText,
  Sparkles,
  ExternalLink,
  Download,
  Maximize2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AttachmentData {
  id: string;
  kind: string;
  originalName: string;
  mime: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
}

export function PromptAttachmentPreview({
  attachment,
}: {
  attachment: AttachmentData;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const isImage =
    attachment.kind === "IMAGE" ||
    attachment.mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(attachment.originalName);

  // Load URL for image thumbnail preview on mount
  React.useEffect(() => {
    let active = true;
    if (isImage && !url) {
      fetch(`/api/v1/attachments/${attachment.id}/url`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (active && data?.url) {
            setUrl(data.url);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [attachment.id, isImage, url]);

  const handleClick = async () => {
    if (!url) {
      try {
        const res = await fetch(`/api/v1/attachments/${attachment.id}/url`);
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setUrl(data.url);
          }
        }
      } catch {}
    }
    setIsOpen(true);
  };

  const isPdf =
    attachment.mime === "application/pdf" ||
    attachment.originalName.toLowerCase().endsWith(".pdf");

  const formattedSize = `(${Math.max(1, Math.round(attachment.bytes / 1024))} KB)`;

  return (
    <>
      {isImage ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClick();
            }
          }}
          className="group relative flex flex-col items-center overflow-hidden rounded-xl border border-border/70 bg-surface-3 transition-all hover:border-accent hover:shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
          title={`View ${attachment.originalName} (${formattedSize})`}
        >
          <div className="relative h-20 w-20 overflow-hidden bg-surface-2 sm:h-24 sm:w-24">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={attachment.originalName}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-fg-muted">
                <Sparkles className="size-5 animate-pulse text-accent" />
              </div>
            )}
            <div className="absolute inset-0 bg-overlay/50 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center">
              <Maximize2 className="size-4 text-accent drop-shadow-xs" />
            </div>
          </div>
          <div className="w-20 px-1 py-0.5 text-center sm:w-24 bg-surface-2/80 backdrop-blur-xs border-t border-border/40">
            <span className="block truncate text-[10px] font-medium text-fg">
              {attachment.originalName}
            </span>
            <span className="text-[9px] text-fg-muted">{formattedSize}</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-surface-3 px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:border-accent hover:bg-surface-elevated hover:text-fg"
          title={`Click to view ${attachment.originalName}`}
        >
          <FileText className="size-3.5 text-accent shrink-0" />
          <div className="flex flex-col text-left">
            <span className="max-w-[140px] truncate font-medium text-fg">
              {attachment.originalName}
            </span>
            <span className="text-[10px] opacity-75">{formattedSize}</span>
          </div>
        </button>
      )}

      {/* Viewer Modal Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl p-4 sm:p-6 bg-surface text-fg">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle className="flex items-center justify-between text-base font-semibold">
              <span className="truncate pr-4">{attachment.originalName}</span>
              <span className="text-xs font-normal text-fg-muted shrink-0">
                {formattedSize}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center min-h-[220px] max-h-[75vh] overflow-auto py-2">
            {isImage ? (
              url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={attachment.originalName}
                  className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-xs"
                />
              ) : (
                <div className="flex items-center gap-2 text-sm text-fg-muted">
                  <Sparkles className="size-4 animate-spin text-accent" />
                  <span>Loading preview...</span>
                </div>
              )
            ) : isPdf && url ? (
              <iframe
                src={url}
                title={attachment.originalName}
                className="w-full h-[65vh] rounded-lg border border-border/50"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                <FileText className="size-12 text-fg-muted" strokeWidth={1.25} />
                <div className="space-y-1">
                  <p className="font-medium text-sm text-fg">
                    {attachment.originalName}
                  </p>
                  <p className="text-xs text-fg-muted">
                    This file format cannot be rendered directly in the preview.
                  </p>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 transition-opacity"
                  >
                    <Download className="size-3.5" />
                    <span>Download / Open File</span>
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                <span>Open in new tab</span>
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
