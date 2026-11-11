"use client";

import * as React from "react";
import { Home, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  computeColumnLayout,
  DEFAULT_LAYOUT_PREFS,
} from "@/lib/annotations/thread-stack";
import { useThreadStackStore, useThreadStackUrlSync } from "@/lib/stores/thread-stack";
import { ThreadColumn } from "./thread-column";
import { cn } from "@/lib/utils";

const COL_WIDTH_KEY = "klecx-ask-col-width";
const COL_WIDTH_MIN = DEFAULT_LAYOUT_PREFS.colMin;
const COL_WIDTH_MAX = 900;
/** Below this viewport width only one column is shown at a time. */
const SINGLE_COLUMN_QUERY = "(max-width: 1023px)";

const spineClass =
  "w-[44px] h-full flex flex-col items-center py-4 bg-surface/80 border-r border-border hover:bg-surface text-muted hover:text-foreground transition-colors shrink-0 group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent";

function truncateQuote(quote: string | undefined, max = 60): string {
  const text = (quote ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface ThreadStackLayoutProps {
  workspaceId: string;
  currentUserId?: string;
  canComment?: boolean;
  canAsk?: boolean;
  /** Caller may add Ask answers to the timeline (server re-checks). */
  canPromoteToTimeline?: boolean;
  /** The main conversation (column 0). It stays mounted while it is a spine. */
  children: React.ReactNode;
  className?: string;
}

export function ThreadStackLayout({
  workspaceId,
  currentUserId,
  canComment,
  canAsk,
  canPromoteToTimeline,
  children,
  className,
}: ThreadStackLayoutProps) {
  const t = useTranslations("Threads");

  useThreadStackUrlSync();

  const stack = useThreadStackStore((s) => s.stack);
  const quotes = useThreadStackStore((s) => s.quotes);
  const back = useThreadStackStore((s) => s.back);
  const closeAll = useThreadStackStore((s) => s.closeAll);
  const goTo = useThreadStackStore((s) => s.goTo);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const [isSingleColumn, setIsSingleColumn] = React.useState(false);

  // Preferred Ask column width, remembered per browser.
  const [colPreferred, setColPreferred] = React.useState(
    DEFAULT_LAYOUT_PREFS.colPreferred
  );
  React.useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(COL_WIDTH_KEY));
      if (stored >= COL_WIDTH_MIN && stored <= COL_WIDTH_MAX) {
        setColPreferred(stored);
      }
    } catch {
      // Storage unavailable: keep the default width.
    }
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Phone / small tablet: by viewport, not by the space left next to the sidebar.
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(SINGLE_COLUMN_QUERY);
    setIsSingleColumn(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsSingleColumn(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Alt+← = Back, Alt+Home = Main conversation
  const hasColumns = stack.length > 0;
  React.useEffect(() => {
    if (!hasColumns) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Home") {
        e.preventDefault();
        closeAll();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasColumns, back, closeAll]);

  const layout = React.useMemo(
    () => computeColumnLayout(containerWidth, stack.length, { colPreferred }),
    [containerWidth, stack.length, colPreferred]
  );

  // Drag handle between the last two full columns
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colPreferred;
    let latest = startWidth;

    const onMove = (move: MouseEvent) => {
      latest = Math.max(
        COL_WIDTH_MIN,
        Math.min(COL_WIDTH_MAX, startWidth + (startX - move.clientX))
      );
      setColPreferred(latest);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        window.localStorage.setItem(COL_WIDTH_KEY, String(latest));
      } catch {
        // Not remembered; the width still applies until reload.
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleResizeKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = Math.max(
      COL_WIDTH_MIN,
      Math.min(COL_WIDTH_MAX, colPreferred + (e.key === "ArrowLeft" ? 24 : -24))
    );
    setColPreferred(next);
    try {
      window.localStorage.setItem(COL_WIDTH_KEY, String(next));
    } catch {
      // ignore
    }
  };

  const columnProps = {
    workspaceId,
    currentUserId,
    canComment,
    canAsk,
    canPromoteToTimeline,
    onBack: back,
    onCloseAll: closeAll,
    onNavigate: goTo,
  };

  // One column at a time: the last entry covers the main conversation, which
  // stays mounted (hidden) so its scroll position and composer draft survive.
  if (isSingleColumn) {
    const activeEntry = stack[stack.length - 1];
    return (
      <div
        ref={containerRef}
        className={cn("relative flex h-full w-full flex-col overflow-hidden", className)}
      >
        <div
          className={cn("flex h-full w-full flex-col overflow-hidden", activeEntry && "hidden")}
        >
          {children}
        </div>
        {activeEntry && (
          <ThreadColumn
            key={activeEntry.id}
            id={activeEntry.id}
            index={stack.length}
            width={containerWidth}
            {...columnProps}
            className="!w-full flex-1 border-r-0"
          />
        )}
      </div>
    );
  }

  const fullColumns = layout.filter((c) => c.mode === "full");
  const lastFullIndex = fullColumns[fullColumns.length - 1]?.index ?? -1;
  const mainColumn = layout.find((c) => c.index === 0 && !c.isGrouped);
  const mainIsFull = mainColumn?.mode === "full";
  const mainIsOwnSpine = mainColumn?.mode === "spine";

  const spineLabel = (index: number) =>
    index === 0
      ? t("mainSpineLabel")
      : t("spineLabel", {
          level: index,
          quote: truncateQuote(quotes[stack[index - 1]?.id ?? ""]),
        });

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full w-full flex-row overflow-hidden bg-background",
        className
      )}
    >
      {/* Column 0: main conversation. Hidden, not unmounted, while it is a spine. */}
      <div
        style={mainIsFull && hasColumns ? { width: mainColumn?.width } : undefined}
        className={cn(
          "h-full flex-col overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none",
          mainIsFull ? "flex" : "hidden",
          hasColumns ? "shrink-0 border-r border-border" : "min-w-0 flex-1"
        )}
        aria-hidden={mainIsFull ? undefined : true}
      >
        {children}
      </div>

      {mainIsOwnSpine && (
        <button
          type="button"
          onClick={closeAll}
          aria-label={t("mainSpineLabel")}
          title={t("mainSpineLabel")}
          className={spineClass}
        >
          <Home className="w-4 h-4 mb-3 text-accent" />
          <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-medium tracking-wide uppercase">
            {t("breadcrumbMain")}
          </span>
        </button>
      )}

      {layout.map((col) => {
        // Oldest spines merged into one "+N" spine
        if (col.isGrouped) {
          return (
            <DropdownMenu key="grouped-spine">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("moreSpines", { count: col.groupedCount ?? 0 })}
                  title={t("hiddenLevels")}
                  className={spineClass}
                >
                  <MoreHorizontal className="w-4 h-4 mb-3 text-accent" />
                  <span className="text-[11px] font-bold text-foreground">
                    +{col.groupedCount}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto text-xs">
                {(col.groupedIndices ?? []).map((idx) => (
                  <DropdownMenuItem
                    key={idx}
                    onClick={() => goTo(idx)}
                    className="cursor-pointer"
                  >
                    <span className="truncate">{spineLabel(idx)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        if (col.index === 0) return null; // main conversation, rendered above

        const entry = stack[col.index - 1];
        if (!entry) return null;

        if (col.mode === "spine") {
          const quote = truncateQuote(quotes[entry.id], 40);
          return (
            <button
              key={`spine-${entry.id}`}
              type="button"
              onClick={() => goTo(col.index)}
              aria-label={spineLabel(col.index)}
              title={spineLabel(col.index)}
              className={spineClass}
            >
              <span className="w-6 h-6 rounded-full bg-accent/10 text-accent font-semibold text-xs flex items-center justify-center mb-3 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                {col.index}
              </span>
              <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-medium tracking-wide truncate max-h-[60%]">
                {quote ? `«${quote}»` : t("level", { level: col.index })}
              </span>
            </button>
          );
        }

        const showResizeHandle = fullColumns.length >= 2 && col.index === lastFullIndex;

        return (
          <React.Fragment key={`column-${entry.id}`}>
            {showResizeHandle && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("resize")}
                aria-valuenow={Math.round(col.width)}
                aria-valuemin={COL_WIDTH_MIN}
                aria-valuemax={COL_WIDTH_MAX}
                tabIndex={0}
                onMouseDown={handleResizeStart}
                onKeyDown={handleResizeKey}
                className="w-1.5 h-full cursor-col-resize hover:bg-accent/40 active:bg-accent focus-visible:bg-accent/60 focus-visible:outline-none transition-colors z-20 shrink-0 -mx-[3px]"
              />
            )}
            <ThreadColumn
              id={entry.id}
              index={col.index}
              width={col.width}
              {...columnProps}
              className="h-full overflow-hidden"
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
