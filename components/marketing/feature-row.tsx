"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  FolderKanban,
  Highlighter,
  History,
  Share2,
  FileDown,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FeatureItem {
  id: string;
  badge: string;
  title: string;
  description: string;
  bullets: string[];
  icon: React.ComponentType<{ className?: string }>;
  previewContent: React.ReactNode;
}

export function MarketingFeatureRow({
  feature,
  reversed = false,
}: {
  feature: FeatureItem;
  reversed?: boolean;
}) {
  const Icon = feature.icon;

  return (
    <div
      id={feature.id}
      className={cn(
        "grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center py-12 md:py-16 border-t border-border/50",
        reversed && "lg:flex-row-reverse"
      )}
    >
      {/* Content Column */}
      <div
        className={cn(
          "lg:col-span-6 space-y-4",
          reversed ? "lg:order-2" : "lg:order-1"
        )}
      >
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-accent/20 bg-accent-soft text-accent text-xs font-semibold">
          <Icon className="h-3.5 w-3.5" />
          <span>{feature.badge}</span>
        </div>

        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg leading-snug">
          {feature.title}
        </h3>

        <p className="text-sm sm:text-base text-fg-muted leading-relaxed">
          {feature.description}
        </p>

        <ul className="space-y-2 pt-2">
          {feature.bullets.map((bullet, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-fg/90">
              <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Visual / Preview Column */}
      <div
        className={cn(
          "lg:col-span-6",
          reversed ? "lg:order-1" : "lg:order-2"
        )}
      >
        <div className="p-2 rounded-2xl border border-border bg-surface-2/60 shadow-xs">
          {feature.previewContent}
        </div>
      </div>
    </div>
  );
}

export function MarketingFeatureList() {
  const t = useTranslations("Marketing.features");

  const features: FeatureItem[] = [
    {
      id: "workspaces-projects",
      badge: t("workspaces.badge"),
      title: t("workspaces.title"),
      description: t("workspaces.description"),
      bullets: [
        t("workspaces.bullet1"),
        t("workspaces.bullet2"),
        t("workspaces.bullet3"),
      ],
      icon: FolderKanban,
      previewContent: (
        <div className="space-y-2.5 p-4 rounded-xl border border-border bg-surface shadow-2xs font-mono text-xs">
          <div className="flex items-center justify-between text-fg-muted pb-2 border-b border-border/60">
            <span className="font-semibold text-fg">{t("workspaces.previewProject")}</span>
            <span className="text-[11px] text-accent font-medium">{t("workspaces.previewCount")}</span>
          </div>
          <div className="space-y-1.5">
            <div className="p-2 rounded-lg bg-surface-2 border border-border/40 text-fg flex items-center justify-between">
              <span>{t("workspaces.previewItem1")}</span>
              <span className="text-[10px] text-fg-subtle">{t("workspaces.previewItem1Time")}</span>
            </div>
            <div className="p-2 rounded-lg bg-surface-2 border border-border/40 text-fg flex items-center justify-between">
              <span>{t("workspaces.previewItem2")}</span>
              <span className="text-[10px] text-fg-subtle">{t("workspaces.previewItem2Time")}</span>
            </div>
            <div className="p-2 rounded-lg bg-surface-2 border border-border/40 text-fg flex items-center justify-between">
              <span>{t("workspaces.previewItem3")}</span>
              <span className="text-[10px] text-fg-subtle">{t("workspaces.previewItem3Time")}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "passage-questions",
      badge: t("passage.badge"),
      title: t("passage.title"),
      description: t("passage.description"),
      bullets: [
        t("passage.bullet1"),
        t("passage.bullet2"),
        t("passage.bullet3"),
      ],
      icon: Highlighter,
      previewContent: (
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs text-xs space-y-3">
          <div className="p-3 rounded-lg bg-surface-2 text-fg leading-relaxed">
            &ldquo;{t("passage.previewQuote")}&rdquo;
          </div>
          <div className="p-2.5 rounded-lg border border-accent/30 bg-accent-soft/40 text-accent space-y-1.5">
            <div className="font-semibold text-[11px] flex items-center gap-1.5">
              <span>{t("passage.previewLabel")}</span>
            </div>
            <p className="text-[11px] text-fg">
              {t("passage.previewQuestion")}
            </p>
            <div className="text-[10px] text-fg-muted border-t border-accent/20 pt-1">
              {t("passage.previewTucked")}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "versions-edits",
      badge: t("versions.badge"),
      title: t("versions.title"),
      description: t("versions.description"),
      bullets: [
        t("versions.bullet1"),
        t("versions.bullet2"),
        t("versions.bullet3"),
      ],
      icon: History,
      previewContent: (
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs text-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <span className="font-semibold text-fg">{t("versions.previewTitle")}</span>
            <div className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded bg-surface-2 text-fg-muted font-mono text-[10px]">{t("versions.v1Label")}</span>
              <span className="px-2 py-0.5 rounded bg-accent text-accent-fg font-mono text-[10px] font-semibold">{t("versions.v2Label")}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-2 font-mono text-[11px] text-fg-muted">
            {t("versions.activeInfo")}
          </div>
        </div>
      ),
    },
    {
      id: "share-collaborate",
      badge: t("share.badge"),
      title: t("share.title"),
      description: t("share.description"),
      bullets: [
        t("share.bullet1"),
        t("share.bullet2"),
        t("share.bullet3"),
      ],
      icon: Share2,
      previewContent: (
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs text-xs space-y-3 font-mono">
          <div className="p-2.5 rounded-lg bg-surface-2 border border-border flex items-center justify-between">
            <span className="text-fg truncate">klecx.app/s/share_7x9qL</span>
            <span className="text-[10px] text-success font-semibold px-2 py-0.5 bg-success/10 rounded">{t("share.liveBadge")}</span>
          </div>
          <div className="text-[11px] text-fg-muted space-y-1">
            <div>{t("share.readOnly")}</div>
            <div>{t("share.revocable")}</div>
          </div>
        </div>
      ),
    },
    {
      id: "export-language",
      badge: t("export.badge"),
      title: t("export.title"),
      description: t("export.description"),
      bullets: [
        t("export.bullet1"),
        t("export.bullet2"),
        t("export.bullet3"),
      ],
      icon: FileDown,
      previewContent: (
        <div className="p-4 rounded-xl border border-border bg-surface shadow-2xs text-xs space-y-2.5">
          <div className="text-fg font-semibold">{t("export.previewTitle")}</div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-medium">
            <div className="p-2 rounded-lg border border-border bg-surface-2 hover:border-accent cursor-pointer transition-colors">
              .md (Markdown)
            </div>
            <div className="p-2 rounded-lg border border-border bg-surface-2 hover:border-accent cursor-pointer transition-colors">
              .pdf (Document)
            </div>
            <div className="p-2 rounded-lg border border-border bg-surface-2 hover:border-accent cursor-pointer transition-colors">
              .docx (Word)
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/20 bg-accent-soft text-accent text-xs font-semibold">
            <span>{t("badge")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("heading")}
          </h2>
          <p className="text-sm sm:text-base text-fg-muted">
            {t("subheading")}
          </p>
        </div>

        <div className="space-y-4">
          {features.map((feature, idx) => (
            <MarketingFeatureRow
              key={feature.id}
              feature={feature}
              reversed={idx % 2 !== 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default MarketingFeatureList;
