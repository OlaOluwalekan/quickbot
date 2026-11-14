"use client";

import * as React from "react";
import { ChevronDown, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Gated } from "@/components/ui/gated";
import { exportFormatGateReason, type GateReason } from "@/lib/entitlements/shared";
import { cn } from "@/lib/utils";

const FORMATS = ["docx", "pdf", "md"] as const;
type DownloadFormat = (typeof FORMATS)[number];

function toFormat(value: string): DownloadFormat {
  const v = value.toLowerCase();
  return v === "pdf" || v === "docx" ? v : "md";
}

export function documentDownloadUrl(
  documentId: string,
  format: string,
  revision: number
): string {
  return `/api/v1/documents/${encodeURIComponent(documentId)}/download?format=${toFormat(format)}&revision=${revision}`;
}

/**
 * Download button (the document's own format) + "Download as" menu for a
 * generated document (F3.4). Markdown needs read access only; Word and PDF
 * need `workspace.export`. The workspace owner's plan decides which formats
 * are available. The server re-checks both.
 */
export function GeneratedDocumentDownload({
  documentId,
  format,
  revision,
  canExport,
  ownerFormats,
  isOwner,
  size = "md",
  className,
}: {
  documentId: string;
  format: string;
  revision: number;
  canExport: boolean;
  /** Formats of the workspace owner's plan (undefined while loading). */
  ownerFormats: readonly string[] | undefined;
  /** The viewer owns the workspace. */
  isOwner: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useTranslations("GeneratedDocs");
  const tFormats = useTranslations("Documents.downloadFormats");
  const tCaps = useTranslations("Documents.caps");
  const reasonFor = (f: DownloadFormat): GateReason | null =>
    exportFormatGateReason({
      format: f,
      ownerFormats,
      isOwner,
      canExport,
      exportCapabilityLabel: tCaps("export"),
    });

  const ownFormat = toFormat(format);
  const ownReason = reasonFor(ownFormat);
  const h = size === "sm" ? "h-7" : "h-8";

  return (
    <div
      className={cn("inline-flex rounded-md shadow-xs", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <Gated reason={ownReason}>
        <Button
          asChild={!ownReason}
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(ownReason)}
          data-testid="doc-download-btn"
          className={cn(h, "gap-1.5 rounded-r-none px-2.5 text-xs font-medium")}
        >
          {ownReason ? (
            <span>
              <Download className="h-3.5 w-3.5" />
              <span>{t("download")}</span>
            </span>
          ) : (
            <a href={documentDownloadUrl(documentId, ownFormat, revision)} download>
              <Download className="h-3.5 w-3.5" />
              <span>{t("download")}</span>
            </a>
          )}
        </Button>
      </Gated>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="doc-download-menu-trigger"
            aria-label={t("downloadAs")}
            title={t("downloadAs")}
            className={cn(h, "rounded-l-none border-l-0 px-1.5")}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {FORMATS.map((f) => (
            <Gated key={f} reason={reasonFor(f)} side="left" className="flex w-full">
              <DropdownMenuItem asChild className="w-full cursor-pointer">
                <a
                  href={documentDownloadUrl(documentId, f, revision)}
                  download
                  data-testid={`download-${f}-item`}
                >
                  <span>{tFormats(f)}</span>
                </a>
              </DropdownMenuItem>
            </Gated>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
