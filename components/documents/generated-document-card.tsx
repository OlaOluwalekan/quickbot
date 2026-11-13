"use client";

import * as React from "react";
import { FileText, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useThreadStackStore } from "@/lib/stores/thread-stack";
import { GeneratedDocumentDownload } from "./generated-document-download";

export interface GeneratedDocumentCardProps {
  document: {
    id: string;
    title: string;
    format: string;
    currentRevision: number;
    createdAt?: string | Date;
  };
  /** Caller holds `workspace.export` (Word / PDF downloads; the server re-checks). */
  canExport?: boolean;
}

/**
 * A document Klecx generated (F3.4), shown below the answer that created it.
 * The whole card opens the document panel; Download gets the current revision.
 */
export function GeneratedDocumentCard({
  document: doc,
  canExport = false,
}: GeneratedDocumentCardProps) {
  const t = useTranslations("GeneratedDocs");
  const openStack = useThreadStackStore((s) => s.open);

  const handleOpen = () => {
    openStack({ kind: "document", id: doc.id });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("openDocument", { title: doc.title })}
      data-testid={`generated-doc-card-${doc.id}`}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      className="group relative flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all hover:border-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              {(doc.format || "md").toUpperCase()}
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
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="doc-open-btn"
          onClick={handleOpen}
          className="h-8 gap-1.5 px-2.5 text-xs font-medium"
        >
          <ExternalLink className="h-3.5 w-3.5 text-muted" />
          <span>{t("open")}</span>
        </Button>

        <GeneratedDocumentDownload
          documentId={doc.id}
          format={doc.format}
          revision={doc.currentRevision}
          canExport={canExport}
        />
      </div>
    </div>
  );
}
