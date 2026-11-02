"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FolderKanban, Plus, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { HomeProjectCard } from "@/lib/api/hooks/home";

export interface ProjectsStripProps {
  items: HomeProjectCard[];
  loading?: boolean;
  onRequestNewProject: () => void;
}

export function ProjectsStrip({
  items,
  loading = false,
  onRequestNewProject,
}: ProjectsStripProps) {
  const tHome = useTranslations("Home");

  if (loading) {
    return (
      <section className="w-full space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-4 rounded-2xl border border-border bg-surface space-y-2"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-fg flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-accent" strokeWidth={1.5} />
          <span>{tHome("projects")}</span>
        </h2>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRequestNewProject}
          className="text-xs h-8 gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{tHome("newProject")}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((project) => (
          <Link
            key={project.id}
            href={`/workspaces?projectId=${project.id}`}
            className="group flex flex-col justify-between p-4 rounded-2xl border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-all shadow-xs"
          >
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                  <FolderKanban className="h-3.5 w-3.5" strokeWidth={1.5} />
                </div>
                <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors line-clamp-1">
                  {project.name}
                </span>
              </div>
              {project.description && (
                <p className="text-xs text-muted line-clamp-2 leading-relaxed mb-2">
                  {project.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-subtle pt-2 border-t border-border/50">
              <span>{project.workspacesCount} workspaces</span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" strokeWidth={1.5} />
                <span>{project.membersCount}</span>
              </span>
            </div>
          </Link>
        ))}

        {/* Create Project Card */}
        <button
          type="button"
          onClick={onRequestNewProject}
          className="flex flex-col items-center justify-center p-6 rounded-2xl border border-dashed border-border bg-surface/50 hover:bg-surface hover:border-accent transition-all text-center gap-2 cursor-pointer group min-h-[110px]"
        >
          <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-subtle group-hover:bg-accent-soft group-hover:text-accent transition-colors">
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <span className="text-xs font-semibold text-muted group-hover:text-fg">
            {tHome("newProject")}
          </span>
        </button>
      </div>
    </section>
  );
}

export default ProjectsStrip;
