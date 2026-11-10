"use client";

import * as React from "react";
import { Home, MoreHorizontal, MessageSquare, ChevronRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  computeColumnLayout,
  type ColumnLayout,
  DEFAULT_LAYOUT_PREFS,
} from "@/lib/annotations/thread-stack";
import { useThreadStackStore, useThreadStackUrlSync } from "@/lib/stores/thread-stack";
import { ThreadColumn } from "./thread-column";
import { cn } from "@/lib/utils";

export interface ThreadStackLayoutProps {
  workspaceId: string;
  currentUserId?: string;
  children: React.ReactNode;
  className?: string;
}

export function ThreadStackLayout({
  workspaceId,
  currentUserId,
  children,
  className,
}: ThreadStackLayoutProps) {
  const t = useTranslations("Threads");

  // Keep URL ?thread= in sync with store
  useThreadStackUrlSync();

  const stack = useThreadStackStore((s) => s.stack);
  const back = useThreadStackStore((s) => s.back);
  const closeAll = useThreadStackStore((s) => s.closeAll);
  const goTo = useThreadStackStore((s) => s.goTo);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1280);
  const [isMobile, setIsMobile] = React.useState(false);

  // Preferred column width remembered in localStorage
  const [colPreferred, setColPreferred] = React.useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("klecx-ask-col-width");
        if (stored) {
          const val = Number(stored);
          if (val >= 420 && val <= 900) return val;
        }
      } catch {
        // Ignore localStorage error
      }
    }
    return DEFAULT_LAYOUT_PREFS.colPreferred;
  });

  // Track container width via ResizeObserver
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width);
          setIsMobile(width < 1024);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keyboard navigation: Alt+Left = Back, Alt+Home = Main
  React.useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (stack.length === 0) return;
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.altKey && e.key === "Home") {
        e.preventDefault();
        closeAll();
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [stack.length, back, closeAll]);

  // Compute column layouts
  const layout = React.useMemo(() => {
    return computeColumnLayout(containerWidth, stack.length, {
      colPreferred,
    });
  }, [containerWidth, stack.length, colPreferred]);

  // Drag handle for resizing the rightmost full column
  const isDraggingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = colPreferred;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Dragging left increases width of the right column; dragging right decreases it
      const delta = startXRef.current - moveEvent.clientX;
      const newWidth = Math.max(420, Math.min(800, startWidthRef.current + delta));
      setColPreferred(newWidth);
      try {
        window.localStorage.setItem("klecx-ask-col-width", String(newWidth));
      } catch {
        // Ignore
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Find full columns for drag handle placement
  const fullCols = layout.filter((c) => c.mode === "full");
  const hasMultipleFull = fullCols.length >= 2;
  const lastFullIndex = fullCols.length > 0 ? (fullCols[fullCols.length - 1]?.index ?? -1) : -1;

  // Main column layout (col 0)
  const mainColLayout = layout.find((c) => c.index === 0) || {
    index: 0,
    mode: "full" as const,
    width: containerWidth,
  };
  const isMainSpine = mainColLayout.mode === "spine";

  // Mobile rendering (< 1024px)
  if (isMobile) {
    if (stack.length === 0) {
      return (
        <div ref={containerRef} className={cn("flex-1 h-full overflow-hidden", className)}>
          {children}
        </div>
      );
    }

    const activeEntry = stack[stack.length - 1];
    if (!activeEntry) {
      return (
        <div ref={containerRef} className={cn("flex-1 h-full overflow-hidden", className)}>
          {children}
        </div>
      );
    }

    return (
      <div ref={containerRef} className={cn("flex-1 h-full overflow-hidden flex flex-col", className)}>
        <ThreadColumn
          id={activeEntry.id}
          index={stack.length}
          width={containerWidth}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          onBack={back}
          onCloseAll={closeAll}
          onNavigate={(idx) => goTo(idx)}
          className="w-full flex-1"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-row h-full w-full overflow-hidden bg-background relative",
        className
      )}
    >
      {/* Column 0: Main Conversation */}
      {isMainSpine ? (
        // Main conversation rendered as a 44px Spine Button
        <button
          type="button"
          onClick={closeAll}
          aria-label={t("mainSpineLabel")}
          className="w-[44px] h-full flex flex-col items-center py-4 bg-surface/80 border-r border-border hover:bg-surface text-muted hover:text-foreground transition-colors shrink-0 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <Home className="w-4 h-4 mb-3 text-accent group-hover:scale-110 transition-transform" />
          <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-medium tracking-wide uppercase">
            {t("breadcrumbMain")}
          </span>
        </button>
      ) : (
        // Main conversation full column
        <div
          style={{ width: mainColLayout.width }}
          className="h-full overflow-hidden flex flex-col shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none border-r border-border"
        >
          {children}
        </div>
      )}

      {/* Columns 1..N: Thread Stack Entries */}
      {layout
        .filter((c) => c.index > 0)
        .map((col) => {
          const entryIdx = col.index - 1;
          const entry = stack[entryIdx];
          if (!entry) return null;

          if (col.mode === "spine") {
            // Grouped spine (+N) when more than 6 spines
            if (col.isGrouped) {
              return (
                <DropdownMenu key={`grouped-spine-${col.index}`}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("hiddenLevels")}
                      className="w-[44px] h-full flex flex-col items-center py-4 bg-surface/80 border-r border-border hover:bg-surface text-muted hover:text-foreground transition-colors shrink-0 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      <MoreHorizontal className="w-4 h-4 mb-3 text-accent" />
                      <span className="text-[11px] font-bold text-foreground">
                        +{col.groupedCount}
                      </span>
                      <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-medium tracking-wide mt-2">
                        {t("hiddenLevels")}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 text-xs">
                    {(col.groupedIndices || []).map((idx) => {
                      const hiddenEntry = idx === 0 ? null : stack[idx - 1];
                      return (
                        <DropdownMenuItem
                          key={`hidden-entry-${idx}`}
                          onClick={() => goTo(idx)}
                          className="cursor-pointer"
                        >
                          {idx === 0
                            ? t("breadcrumbMain")
                            : `Level ${idx}: ${hiddenEntry?.id ? hiddenEntry.id.slice(0, 8) : ""}`}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            // Normal Individual 44px Spine Button
            return (
              <button
                key={`spine-${entry.id}`}
                type="button"
                onClick={() => goTo(col.index)}
                aria-label={t("spineLabel", {
                  level: col.index,
                  quote: entry.id.slice(0, 8),
                })}
                className="w-[44px] h-full flex flex-col items-center py-4 bg-surface/80 border-r border-border hover:bg-surface text-muted hover:text-foreground transition-colors shrink-0 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <div className="w-6 h-6 rounded-full bg-accent/10 text-accent font-semibold text-xs flex items-center justify-center mb-3 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                  L{col.index}
                </div>
                <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-medium tracking-wide truncate max-h-[220px]">
                  Level {col.index}
                </span>
              </button>
            );
          }

          // Full column mode
          const isRightmost = col.index === lastFullIndex;
          const showDragHandle = hasMultipleFull && isRightmost;

          return (
            <React.Fragment key={`full-${entry.id}`}>
              {/* Optional resize drag handle before the rightmost full column */}
              {showDragHandle && (
                <div
                  onMouseDown={handleMouseDownDrag}
                  aria-label={t("resize")}
                  role="separator"
                  className="w-1.5 h-full cursor-col-resize hover:bg-accent/40 active:bg-accent transition-colors z-20 shrink-0 -mx-[3px]"
                />
              )}

              <ThreadColumn
                id={entry.id}
                index={col.index}
                width={col.width}
                workspaceId={workspaceId}
                currentUserId={currentUserId}
                onBack={back}
                onCloseAll={closeAll}
                onNavigate={(idx) => goTo(idx)}
                className="h-full overflow-hidden"
              />
            </React.Fragment>
          );
        })}
    </div>
  );
}
