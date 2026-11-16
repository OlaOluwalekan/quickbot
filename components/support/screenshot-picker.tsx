"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, X, AlertCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MAX_SUPPORT_SCREENSHOTS,
  MAX_SUPPORT_SCREENSHOT_BYTES,
  MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES,
  SUPPORT_SCREENSHOT_MIME_TYPES,
  isSupportScreenshotMime,
} from "@/lib/support/screenshots";
import { shrinkScreenshot } from "@/lib/support/shrink-image";

export interface PickedScreenshot {
  id: string;
  file: File;
  /** Object URL for the thumbnail; revoked when removed. */
  url: string;
}

interface ScreenshotPickerProps {
  value: PickedScreenshot[];
  onChange: (next: PickedScreenshot[]) => void;
  disabled?: boolean;
}

const MAX_MB = MAX_SUPPORT_SCREENSHOT_BYTES / (1024 * 1024);

/**
 * Up to five screenshots for a support request: button, drag and drop, and
 * paste (Ctrl/⌘+V anywhere in the form, see `useScreenshotPaste`).
 * Checks type, size and count here; the server checks again.
 */
export function ScreenshotPicker({ value, onChange, disabled }: ScreenshotPickerProps) {
  const t = useTranslations("Support.screenshots");
  const inputId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Keep the latest list for async additions (paste, drop).
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const addFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const nextErrors: string[] = [];
      const accepted: PickedScreenshot[] = [];
      let current = valueRef.current;
      setBusy(true);
      try {
        for (const file of files) {
          if (current.length + accepted.length >= MAX_SUPPORT_SCREENSHOTS) {
            nextErrors.push(t("errors.tooMany", { max: MAX_SUPPORT_SCREENSHOTS }));
            break;
          }
          if (!isSupportScreenshotMime(file.type)) {
            nextErrors.push(t("errors.type", { name: file.name }));
            continue;
          }
          if (file.size > MAX_SUPPORT_SCREENSHOT_BYTES) {
            nextErrors.push(t("errors.tooLarge", { name: file.name, maxMb: MAX_MB }));
            continue;
          }
          const ready = await shrinkScreenshot(file);
          const total =
            [...current, ...accepted].reduce((sum, s) => sum + s.file.size, 0) + ready.size;
          if (total > MAX_SUPPORT_SCREENSHOTS_TOTAL_BYTES) {
            nextErrors.push(t("errors.totalTooLarge"));
            continue;
          }
          accepted.push({
            id: crypto.randomUUID(),
            file: ready,
            url: URL.createObjectURL(ready),
          });
        }
      } finally {
        setBusy(false);
      }
      setErrors(nextErrors);
      if (accepted.length) {
        current = [...valueRef.current, ...accepted];
        valueRef.current = current;
        onChange(current);
      }
    },
    [onChange, t]
  );

  usePasteScreenshots(disabled ? null : addFiles);

  // Revoke thumbnail URLs when the picker goes away.
  React.useEffect(
    () => () => valueRef.current.forEach((s) => URL.revokeObjectURL(s.url)),
    []
  );

  const remove = (id: string) => {
    const shot = value.find((s) => s.id === id);
    if (shot) URL.revokeObjectURL(shot.url);
    onChange(value.filter((s) => s.id !== id));
    setErrors([]);
  };

  const full = value.length >= MAX_SUPPORT_SCREENSHOTS;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-semibold text-fg">
          {t("label")}
        </label>
        <span className="text-[11px] font-mono text-fg-subtle" data-testid="screenshot-counter">
          {t("counter", { count: value.length, max: MAX_SUPPORT_SCREENSHOTS })}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          if (disabled || full) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled || full) return;
          void addFiles(Array.from(e.dataTransfer.files));
        }}
        data-testid="screenshot-dropzone"
        className={cn(
          "rounded-xl border border-dashed border-border bg-surface-2/30 p-4 space-y-3 transition-colors",
          dragging && "border-accent bg-accent-soft"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || full || busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg text-xs gap-1.5 self-start"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            <span>{busy ? t("preparing") : t("add")}</span>
          </Button>
          <div className="text-[11px] text-fg-subtle leading-relaxed">
            <p>{t("dropHint")}</p>
            <p>{t("formats", { maxMb: MAX_MB })}</p>
          </div>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={SUPPORT_SCREENSHOT_MIME_TYPES.join(",")}
            multiple
            hidden
            disabled={disabled || full}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addFiles(files);
            }}
          />
        </div>

        {value.length > 0 && (
          <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {value.map((shot, index) => (
              <li
                key={shot.id}
                className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img
                  src={shot.url}
                  alt={t("previewAlt", { index: index + 1, name: shot.file.name })}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(shot.id)}
                  disabled={disabled}
                  aria-label={t("remove", { name: shot.file.name })}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg/90 text-fg shadow-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1" role="alert">
          {errors.map((message, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-danger">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{message}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-fg-subtle">
        <ShieldAlert className="h-3 w-3 shrink-0 mt-0.5 text-warning" />
        <span>{t("privacy")}</span>
      </p>
    </div>
  );
}

/** Adds images pasted anywhere on the page (Ctrl/⌘+V) while the form is shown. */
function usePasteScreenshots(onFiles: ((files: File[]) => void | Promise<void>) | null) {
  React.useEffect(() => {
    if (!onFiles) return;
    const handler = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length === 0) return; // plain text paste stays untouched
      e.preventDefault();
      void onFiles(files);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [onFiles]);
}
