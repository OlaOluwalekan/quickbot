"use client";

import * as React from "react";
import { ImageIcon, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeLink } from "./safe-link";

export interface SafeImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: any;
  alt?: string;
  className?: string;
}

const ALLOWED_HOSTS = new Set([
  "res.cloudinary.com",
  "lh3.googleusercontent.com",
  "avatars.githubusercontent.com",
]);

function isAllowedImageSrc(src?: string): boolean {
  if (!src) return false;

  // Allow local blob URLs (previews) and inline data image URIs
  if (src.startsWith("blob:") || src.startsWith("data:image/")) {
    return true;
  }

  // Relative URLs starting with /
  if (src.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function SafeImage({ src, alt, className, ...props }: SafeImageProps) {
  const srcString = typeof src === "string" ? src : undefined;
  const isAllowed = isAllowedImageSrc(srcString);

  if (!isAllowed) {
    // Untrusted remote image host: NEVER issue an HTTP request!
    // Render safely as a protected link so user context is never exfiltrated.
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 my-1 rounded-md border border-border bg-surface-2 text-xs text-fg-muted font-mono">
        <ShieldAlert className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden="true" />
        <span className="sr-only">Untrusted external image blocked: </span>
        <SafeLink href={srcString}>
          {alt ? `[Blocked image: ${alt}]` : `[Blocked external image: ${srcString || ""}]`}
        </SafeLink>
      </span>
    );
  }

  return (
    <span className="block my-3 overflow-hidden rounded-xl border border-border bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={srcString}
        alt={alt || "Image output"}
        loading="lazy"
        className={cn(
          "max-w-full h-auto object-contain rounded-xl transition-all duration-200",
          className
        )}
        {...props}
      />
    </span>
  );
}
