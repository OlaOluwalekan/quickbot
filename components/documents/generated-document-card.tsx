"use client";

import * as React from "react";
import { FileText, Download, ChevronDown, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Gated } from "@/components/ui/gated";
import { useThreadStackStore } from "@/lib/stores/thread-stack";

export interface GeneratedDocumentCardProps {
  document: {
    id: string;
    title: string;
    format: string;
    currentRevision: number;
    createdAt?: string | Date;
  };
  workspaceId: string;
  canExport?: boolean;
}

export function GeneratedDocumentCard({
  document: doc,
  workspaceId,
  canExport = true,
}: GeneratedDocumentCardProps) {
  const t = useTranslations("GeneratedDocs");
  const openStack = useThreadStackStore((s) => s.open);

  const handleOpen = () => {
    openStack({ kind: "document", id: doc.id });
  };

  const handleDownload = (format: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const url = `/api/v1/documents/${doc.id}/download?format=${format}&revision=${doc.currentRevision}`;
    const link = window.document.createElement("a");
    link.href = url;
    link.download = "";
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const formatUpper = (doc.format || "md").toUpperCase();

  return (
    <div
      data-testid={`generated-doc-card-${doc.id}`}
      onClick={handleOpen}
      className="group relative flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all hover:border-accent/40 hover:bg-surface/80 cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-foreground/80 group-hover:text-accent group-hover:border-accent/30 transition-colors">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground truncate max-w-[260px] sm:max-w-md">
              {doc.title}
            </span>
            <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted uppercase">
              {formatUpper}
            </span>
            {doc.currentRevision > 1 && (
              <span
                data-testid="doc-edited-badge"
                className="inline-flex items-center rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
              >
                {t("edited")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted truncate mt-0.5">
            {t("revision", { revision: doc.currentRevision })}
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="doc-open-btn"
          onClick={handleOpen}
          className="h-8 gap-1.5 px-2.5 text-xs font-medium border-border hover:bg-surface-2"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted" />
          <span>{t("open")}</span>
        </Button>

        <div className="inline-flex rounded-md shadow-xs">
          <Button
            type="button"
            size="sm"
            variant="default"
            data-testid="doc-download-btn"
            onClick={(e) => handleDownload(doc.format, e)}
            className="h-8 gap-1.5 rounded-r-none px-2.5 text-xs font-medium bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t("download")}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="default"
                data-testid="doc-download-menu-trigger"
                className="h-8 rounded-l-none border-l border-accent-foreground/20 px-1.5 bg-accent text-accent-foreground hover:bg-accent/90"
                aria-label={t("downloadAs")}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                data-testid="download-md-item"
                onClick={(e) => handleDownload("md", e)}
              >
                <span>Markdown (.md)</span>
              </DropdownMenuItem>

              <Gated
                reason={
                  canExport
                    ? null
                    : {
                        code: "no_permission",
                        capability: t("formatNotAllowed"),
                      }
                }
              >
                <DropdownMenuItem
                  data-testid="download-pdf-item"
                  onClick={(e) => handleDownload("pdf", e)}
                >
                  <span>PDF (.pdf)</span>
                </DropdownMenuItem>
              </Gated>

              <Gated
                reason={
                  canExport
                    ? null
                    : {
                        code: "no_permission",
                        capability: t("formatNotAllowed"),
                      }
                }
              >
                <DropdownMenuItem
                  data-testid="download-docx-item"
                  onClick={(e) => handleDownload("docx", e)}
                >
                  <span>Word (.docx)</span>
                </DropdownMenuItem>
              </Gated>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
