"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  FolderKanban,
  Sparkles,
  MessageSquarePlus,
  Brain,
  History,
  CornerDownRight,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function MarketingHero() {
  const t = useTranslations("Marketing.hero");

  return (
    <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24">
      {/* Background radial glow */}
      <div className="bg-accent/5 pointer-events-none absolute top-0 left-1/2 -z-10 h-100 w-200 -translate-x-1/2 rounded-full blur-3xl" />

      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        {/* Value Proposition Badge */}
        <div className="border-accent/30 bg-accent-soft text-accent mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{t("badge")}</span>
        </div>

        {/* Primary Headline */}
        <h1 className="text-fg text-3xl leading-[1.15] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          {t("titlePart1")} <br className="hidden sm:inline" />
          <span className="text-accent decoration-accent/30 underline decoration-wavy underline-offset-8">
            {t("titlePart2")}
          </span>
        </h1>

        {/* Honest Subtitle */}
        <p className="text-fg-muted mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg">
          {t("subtitle")}
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-accent text-accent-fg hover:bg-accent-hover h-11 w-full px-6 text-sm font-semibold shadow-sm sm:w-auto"
          >
            <Link href="/auth/register" className="flex items-center gap-2">
              <span>{t("startFree")}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-border bg-surface text-fg hover:bg-surface-2 h-11 w-full px-6 text-sm font-semibold sm:w-auto"
          >
            <Link href="/pricing">{t("seePricing")}</Link>
          </Button>
        </div>

        {/* Realistic Product UI Preview */}
        <div className="relative mx-auto mt-14 max-w-4xl text-left">
          <div className="border-border bg-surface overflow-hidden rounded-2xl border shadow-md transition-all duration-300">
            {/* Window Chrome / Title Bar */}
            <div className="border-border/80 bg-surface-2/80 text-fg-muted flex items-center justify-between border-b px-4 py-2.5 text-xs select-none">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="bg-danger/60 h-2.5 w-2.5 rounded-full" />
                  <div className="bg-warning/60 h-2.5 w-2.5 rounded-full" />
                  <div className="bg-success/60 h-2.5 w-2.5 rounded-full" />
                </div>
                <span className="text-fg-subtle ml-2 font-mono text-[11px]">
                  klecx/workspaces/ws_arch_01
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-border/80 bg-surface font-mono text-[10px]"
                >
                  {t("geminiFlash")}
                </Badge>
              </div>
            </div>

            {/* Simulated Workspace Shell */}
            <div className="grid min-h-105 grid-cols-1 md:grid-cols-12">
              {/* Left Projects & Workspaces Rail */}
              <div className="border-border bg-surface-2/40 hidden space-y-4 border-r p-3 text-xs md:col-span-4 md:block">
                <div>
                  <div className="text-fg-subtle flex items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
                    <span>{t("projectsLabel")}</span>
                    <FolderKanban className="h-3 w-3" />
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <div className="bg-accent/10 text-accent flex items-center gap-2 rounded-md px-2 py-1.5 font-medium">
                      <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Database Architecture</span>
                    </div>
                    <div className="text-fg-muted hover:bg-surface-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors">
                      <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Product Roadmap 2027</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-fg-subtle px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
                    {t("workspacesInProject")}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <div className="bg-surface border-border/60 text-fg flex items-center justify-between rounded-md border px-2 py-1.5 font-medium shadow-2xs">
                      <span className="truncate">
                        Postgres Pooling vs Replicas
                      </span>
                      <span className="text-accent text-[10px]">
                        {t("active")}
                      </span>
                    </div>
                    <div className="text-fg-muted hover:bg-surface-2 flex items-center justify-between rounded-md px-2 py-1.5 transition-colors">
                      <span className="truncate">Redis Event Invalidation</span>
                    </div>
                    <div className="text-fg-muted hover:bg-surface-2 flex items-center justify-between rounded-md px-2 py-1.5 transition-colors">
                      <span className="truncate">Prisma Indexing Audit</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Workspace Stream Area */}
              <div className="bg-bg col-span-1 flex flex-col justify-between space-y-4 p-4 sm:p-5 md:col-span-8">
                {/* User Prompt */}
                <div className="flex justify-end">
                  <div className="bg-surface-2 border-border text-fg max-w-[90%] rounded-2xl rounded-tr-xs border px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs">
                    {t("promptExample")}
                  </div>
                </div>

                {/* Response Card */}
                <div className="border-border bg-surface space-y-3 rounded-xl border p-4 shadow-2xs">
                  {/* Thinking Panel Pill */}
                  <div className="border-accent/20 bg-accent-soft/40 text-accent flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium">
                    <Brain className="h-3.5 w-3.5 animate-pulse" />
                    <span>{t("thoughtPreview")}</span>
                  </div>

                  {/* Versions Badge */}
                  <div className="border-border/60 flex items-center justify-between border-b pb-2 text-xs">
                    <div className="text-fg-muted flex items-center gap-1.5 font-mono text-[11px]">
                      <History className="text-accent h-3.5 w-3.5" />
                      <span>{t("versionInfo")}</span>
                      <span className="text-fg-subtle">
                        {t("regeneratedNote")}
                      </span>
                    </div>
                  </div>

                  {/* Response Body with Highlight Callout */}
                  <div className="text-fg space-y-2 text-xs leading-relaxed">
                    <p>
                      {t("responseSnippet1")}{" "}
                      <span className="bg-accent/20 text-fg border-accent rounded border-b px-1 py-0.5 font-medium">
                        {t("responseSnippet2")}
                      </span>{" "}
                      {t("responseSnippet3")}
                    </p>

                    {/* Interactive Annotation Popover Simulation */}
                    <div className="border-accent/40 bg-accent text-accent-fg inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm">
                      <MessageSquarePlus className="h-3 w-3" />
                      <span>{t("askPassage")}</span>
                      <ChevronRight className="h-3 w-3 opacity-70" />
                    </div>

                    <div className="border-border bg-surface-2 text-fg-muted rounded-lg border p-2.5 font-mono text-[11px]">
                      <code>
                        pool_mode = transaction | max_client_conn = 10000 |
                        default_pool_size = 50
                      </code>
                    </div>
                  </div>
                </div>

                {/* Sub-question branch preview */}
                <div className="border-accent/30 space-y-1 border-l-2 pl-4">
                  <div className="text-fg-muted flex items-center gap-1 text-[11px] font-medium">
                    <CornerDownRight className="text-accent h-3 w-3" />
                    <span>{t("sideQuestion")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarketingHero;
