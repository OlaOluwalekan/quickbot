"use client";

import * as React from "react";
import { ChevronRight, Home, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface BreadcrumbItem {
  id: string;
  quote?: string;
  depth: number;
  kind?: "annotation" | "document";
}

export interface ThreadBreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
  className?: string;
}

function truncate(str: string, maxLen = 22): string {
  if (!str) return "";
  const trimmed = str.trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

export function ThreadBreadcrumb({
  items,
  onNavigate,
  className,
}: ThreadBreadcrumbProps) {
  const t = useTranslations("Threads");

  // Total breadcrumb steps = Main (index 0) + items (indices 1..N)
  const totalCount = 1 + items.length;

  return (
    <nav
      aria-label={t("navLabel")}
      className={`flex items-center text-xs text-muted font-medium overflow-hidden ${
        className || ""
      }`}
    >
      {/* Main conversation link */}
      <button
        type="button"
        onClick={() => onNavigate(0)}
        className="flex items-center gap-1 hover:text-foreground transition-colors shrink-0 px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        title={t("main")}
      >
        <Home className="w-3.5 h-3.5" />
        <span className="truncate max-w-[80px]">{t("breadcrumbMain")}</span>
      </button>

      {/* When total items <= 3: render all */}
      {totalCount <= 3 ? (
        items.map((item, idx) => {
          const colIndex = idx + 1;
          const isLast = idx === items.length - 1;
          const label = item.quote
            ? `«${truncate(item.quote)}»`
            : t("level", { level: item.depth + 1 });

          return (
            <React.Fragment key={item.id}>
              <ChevronRight className="w-3 h-3 text-muted/50 shrink-0 mx-0.5" />
              <button
                type="button"
                onClick={() => onNavigate(colIndex)}
                disabled={isLast}
                className={`truncate max-w-[130px] px-1 py-0.5 rounded transition-colors ${
                  isLast
                    ? "text-foreground font-semibold cursor-default"
                    : "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                }`}
                title={item.quote || t("level", { level: item.depth + 1 })}
              >
                {label}
              </button>
            </React.Fragment>
          );
        })
      ) : (
        /* When total items > 3: collapse middle items into dropdown */
        <>
          <ChevronRight className="w-3 h-3 text-muted/50 shrink-0 mx-0.5" />

          {/* Collapsed middle dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-muted hover:text-foreground hover:bg-muted/10"
                aria-label={t("hiddenLevels")}
              >
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {items.slice(0, -1).map((item, idx) => {
                const colIndex = idx + 1;
                const label = item.quote
                  ? t("levelWithQuote", {
                      level: item.depth + 1,
                      quote: truncate(item.quote, 30),
                    })
                  : t("level", { level: item.depth + 1 });

                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => onNavigate(colIndex)}
                    className="text-xs cursor-pointer"
                  >
                    {label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <ChevronRight className="w-3 h-3 text-muted/50 shrink-0 mx-0.5" />

          {/* Last (deepest) item */}
          {(() => {
            const lastItem = items[items.length - 1];
            if (!lastItem) return null;
            const label = lastItem.quote
              ? `«${truncate(lastItem.quote, 28)}»`
              : t("level", { level: lastItem.depth + 1 });

            return (
              <span
                className="truncate max-w-[150px] px-1 py-0.5 text-foreground font-semibold"
                title={lastItem.quote}
              >
                {label}
              </span>
            );
          })()}
        </>
      )}
    </nav>
  );
}
