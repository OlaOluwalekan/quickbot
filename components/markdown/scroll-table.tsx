"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ScrollTable({
  children,
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-border shadow-2xs bg-surface">
      <table
        className={cn(
          "w-full text-left text-xs sm:text-sm border-collapse min-w-[320px]",
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function ScrollTableHead({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "sticky top-0 z-10 bg-surface-2 border-b border-border text-fg font-semibold select-none",
        className
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function ScrollTableCell({
  children,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 border-b border-border/50 text-fg/90 align-top leading-relaxed",
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}

export function ScrollTableTh({
  children,
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-fg-muted",
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}
