"use client";

import * as React from "react";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { SafeImage, isAllowedImageSrc } from "./safe-image";

export interface DocumentImageProps {
  src?: unknown;
  alt?: string;
  className?: string;
}

/**
 * An image inside an uploaded document. Pictures of an uploaded file are not
 * imported, and pictures on other sites are never requested, so most of them
 * can't be shown: a box with the image's description stands in their place.
 * The description is ordinary text, so it can be highlighted like the rest.
 */
export function DocumentImage({ src, alt, className }: DocumentImageProps) {
  const t = useTranslations("Documents");
  const srcString = typeof src === "string" ? src : undefined;

  if (isAllowedImageSrc(srcString)) {
    return <SafeImage src={srcString} alt={alt} className={className} />;
  }

  const description = alt?.trim();

  return (
    <span
      data-testid="document-image-placeholder"
      className="my-3 flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/60 px-4 py-5 text-center text-sm text-fg-muted"
    >
      <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {description ? (
        <>
          <span className="sr-only" data-annot-ignore="true">
            {t("imagePlaceholder")}:{" "}
          </span>
          <span>{description}</span>
        </>
      ) : (
        <span data-annot-ignore="true">{t("imagePlaceholder")}</span>
      )}
    </span>
  );
}
