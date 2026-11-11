"use client";

import * as React from "react";
import { Check, Copy, RotateCcw, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { ThinkingPanel } from "./thinking-panel";
import { SourcesAccordion } from "./citations";
import { AnnotationLayer } from "@/components/annotations/annotation-layer";
import type { CitationDto } from "@/lib/api/sse";

export interface AnswerBodyProps {
  content: string;
  thoughtSummary?: string | null;
  citations?: CitationDto[];
  status?: "STREAMING" | "COMPLETE" | "FAILED" | string;
  isStreaming?: boolean;
  onRetry?: () => void;
  // Annotation attributes
  targetType: "RESPONSE_VERSION" | "ANNOTATION_MESSAGE" | "DOCUMENT_REVISION";
  targetId?: string;
  depth?: number;
  workspaceId?: string;
  responseId?: string;
  versionId?: string;
  contentSource?: "ORIGINAL" | "EDIT";
  editRevision?: number | string;
  showCopyButton?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function AnswerBody({
  content,
  thoughtSummary,
  citations = [],
  status = "COMPLETE",
  isStreaming = false,
  onRetry,
  targetType,
  targetId,
  depth = 0,
  workspaceId,
  responseId,
  versionId,
  contentSource = "ORIGINAL",
  editRevision,
  showCopyButton = false,
  className,
  children,
}: AnswerBodyProps) {
  const t = useTranslations("Response");
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const isFailed = status === "FAILED";

  return (
    <div className={cn("space-y-3", className)}>
      {/* Thinking Panel (if summary present or streaming) */}
      {(thoughtSummary || isStreaming) && (
        <ThinkingPanel
          thoughtSummary={thoughtSummary}
          isStreaming={isStreaming}
        />
      )}

      {/* Main answer text wrapped in annotatable container */}
      <div
        className="leading-relaxed select-text"
        data-annot-root="true"
        data-annot-target-type={targetType}
        data-annot-target-id={targetId}
        data-annot-depth={depth}
        data-workspace-id={workspaceId}
        data-response-id={responseId}
        data-version-id={versionId}
        data-content-source={contentSource}
        data-edit-revision={editRevision !== undefined ? String(editRevision) : undefined}
      >
        <AnnotationLayer
          responseId={responseId}
          versionId={versionId}
          content={content}
        >
          <Markdown content={content} citations={citations} />
        </AnnotationLayer>
      </div>

      {/* Citations / Sources Accordion */}
      {citations && citations.length > 0 && (
        <SourcesAccordion citations={citations} label={t("sources")} />
      )}

      {/* Failed state with Retry button */}
      {isFailed && (
        <div
          data-testid="answer-failed"
          className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-danger/30 bg-danger/5 text-xs text-danger"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-danger/80" />
            <span>{t("generationFailed") || "Answering failed"}</span>
          </div>
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="h-7 px-2 text-xs border-danger/40 text-danger hover:bg-danger/10"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              <span>{t("tryAgain") || "Retry"}</span>
            </Button>
          )}
        </div>
      )}

      {/* Extra children (e.g. generated documents) */}
      {children}

      {/* Optional Copy Button */}
      {showCopyButton && content && (
        <div className="flex items-center justify-end pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-muted hover:text-foreground h-7 px-2 text-xs"
            aria-label={copied ? t("copied") : t("copy")}
          >
            {copied ? (
              <>
                <Check className="text-accent mr-1 h-3.5 w-3.5" />
                <span>{t("copied")}</span>
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3.5 w-3.5" />
                <span>{t("copy")}</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
