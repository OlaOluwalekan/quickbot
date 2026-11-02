"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, MessageSquare, Users } from "lucide-react";
import { formatCustomDate } from "@/utils/format";
import type { HomeSharedWorkspace } from "@/lib/api/hooks/home";

export interface SharedWorkspacesProps {
  items: HomeSharedWorkspace[];
}

export function SharedWorkspaces({ items }: SharedWorkspacesProps) {
  const tHome = useTranslations("Home");

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-fg flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" strokeWidth={1.5} />
          <span>{tHome("sharedWithMe")}</span>
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
                <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors line-clamp-1">
                  {ws.title}
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-subtle group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                  strokeWidth={1.5}
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted mb-2">
                <Users className="h-3.5 w-3.5 shrink-0 text-subtle" strokeWidth={1.5} />
                <span className="truncate">Shared by {ws.ownerName}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-subtle pt-2 border-t border-border/50">
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>Shared Workspace</span>
              </span>
              <span>{formatCustomDate(ws.lastActivityAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default SharedWorkspaces;
