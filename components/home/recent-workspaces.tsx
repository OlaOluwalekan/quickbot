"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Clock, FolderKanban, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCustomDate } from "@/utils/format";
import type { HomeRecentWorkspace } from "@/lib/api/hooks/home";

export interface RecentWorkspacesProps {
  items: HomeRecentWorkspace[];
  loading?: boolean;
}

export function RecentWorkspaces({ items, loading = false }: RecentWorkspacesProps) {
  const tHome = useTranslations("Home");

  if (loading) {
    return (
      <section className="w-full space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border border-border bg-surface space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-fg flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" strokeWidth={1.5} />
          <span>{tHome("continueWhereYouLeftOff")}</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((ws) => (
          <Link
            key={ws.id}
            href={`/workspaces/${ws.id}`}
            className="group flex flex-col justify-between p-4 rounded-2xl border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-all shadow-xs"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors line-clamp-1 flex-1">
                  {ws.title}
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-subtle group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  strokeWidth={1.5}
                />
              </div>

              {ws.lastSnippet && (
                <p className="text-xs text-muted line-clamp-2 leading-relaxed mb-3">
                  {ws.lastSnippet}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-subtle pt-2 border-t border-border/50">
              {ws.projectName ? (
                <span className="inline-flex items-center gap-1 font-medium text-accent truncate max-w-[140px]">
                  <FolderKanban className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{ws.projectName}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>Workspace</span>
                </span>
              )}
              <span>{formatCustomDate(ws.lastActivityAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default RecentWorkspaces;
