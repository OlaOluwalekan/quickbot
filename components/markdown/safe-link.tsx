"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SafeLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SafeLink({ href, children, className, ...props }: SafeLinkProps) {
  // If no href or relative anchor
  if (!href || href === "#" || href.startsWith("#")) {
    return (
      <a
        href={href || "#"}
        className={cn(
          "text-accent underline underline-offset-2 hover:text-accent-hover transition-colors font-medium",
          className
        )}
        {...props}
      >
        {children}
      </a>
    );
  }

  // Extract hostname for hover title
  let hostname = "";
  try {
    hostname = new URL(href).hostname;
  } catch {
    // Relative or invalid link
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={hostname ? `External link to ${hostname}` : undefined}
      className={cn(
        "inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:text-accent-hover transition-colors font-medium break-all group/link",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      <ExternalLink
        className="h-3 w-3 inline-block shrink-0 opacity-70 group-hover/link:opacity-100 transition-opacity"
        aria-hidden="true"
      />
    </a>
  );
}
