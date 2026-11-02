"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, X, Eye, Edit3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface EditResponseProps {
  initialContent: string;
  onSave: (content: string) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
  className?: string;
}

export function EditResponse({
  initialContent,
  onSave,
  onCancel,
  isSaving = false,
  className,
}: EditResponseProps) {
  const t = useTranslations("Response");
  const [content, setContent] = React.useState(initialContent);
  const [activeTab, setActiveTab] = React.useState<"edit" | "preview">("edit");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Position cursor at the end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (content.trim() && !isSaving) {
        void onSave(content);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const isUnchanged = content.trim() === initialContent.trim();
  const isEmpty = content.trim().length === 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-accent/40 bg-surface p-4 shadow-sm space-y-3 transition-all",
        className
      )}
    >
      {/* Editor Header / Tab switcher */}
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-surface-2 border border-border text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("edit")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer",
              activeTab === "edit"
                ? "bg-surface text-fg shadow-2xs"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>{t("editor")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer",
              activeTab === "preview"
                ? "bg-surface text-fg shadow-2xs"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{t("preview")}</span>
          </button>
        </div>

        <span className="text-[11px] text-fg-muted hidden sm:inline">
          {t("editHelper")}
        </span>
      </div>

      {/* Editor Body */}
      {activeTab === "edit" ? (
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={Math.min(18, Math.max(6, content.split("\n").length + 2))}
          className="w-full resize-y font-mono text-xs sm:text-sm leading-relaxed p-3 rounded-xl border-border bg-bg/60 text-fg focus-visible:ring-accent"
          placeholder="Edit response content..."
          disabled={isSaving}
        />
      ) : (
        <div className="min-h-[120px] max-h-[400px] overflow-y-auto p-3 rounded-xl border border-border bg-bg/40 text-sm leading-relaxed text-fg whitespace-pre-wrap select-text">
          {content || <span className="italic text-fg-muted">Nothing to preview.</span>}
        </div>
      )}

      {/* Helper text on mobile */}
      <p className="text-[11px] text-fg-muted sm:hidden">
        {t("editHelper")}
      </p>

      {/* Footer action buttons */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className="text-xs"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          {t("cancel")}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => void onSave(content)}
          disabled={isSaving || isEmpty || isUnchanged}
          className="text-xs bg-accent text-accent-fg hover:bg-accent/90"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 mr-1" />
          )}
          {t("saveEdit")}
        </Button>
      </div>
    </div>
  );
}
