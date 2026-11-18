"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
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
  CheckCircle2,
  Code2,
  TrendingUp,
  HardHat,
  ChefHat,
  GraduationCap,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  HERO_ROTATION_MS,
  HERO_SCENES,
  HERO_SCENE_DEFINITIONS,
  type HeroSceneKey,
} from "@/lib/marketing/hero-scenes";

const SCENE_ICONS = {
  Code2,
  TrendingUp,
  HardHat,
  ChefHat,
  GraduationCap,
  Store,
} as const;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

function getReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia
    ? window.matchMedia(REDUCED_MOTION_QUERY).matches
    : false;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Server and first client render assume "motion allowed, tab visible" (no hydration mismatch). */
function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false
  );
}

function useTabHidden() {
  return React.useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "hidden",
    () => false
  );
}

export function MarketingHero() {
  const t = useTranslations("Marketing.hero");

  const [activeScene, setActiveScene] = React.useState<HeroSceneKey>(
    HERO_SCENES[0]
  );
  const [isHovered, setIsHovered] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isTabHidden = useTabHidden();
  const tabRefs = React.useRef<
    Partial<Record<HeroSceneKey, HTMLButtonElement | null>>
  >({});

  // Auto-rotation; paused on hover, focus within the hero preview, a hidden tab, or reduced motion.
  // Keyed on `activeScene`, so a manual pick restarts the full interval.
  React.useEffect(() => {
    if (prefersReducedMotion || isHovered || isFocused || isTabHidden) return;
    const id = setInterval(() => {
      setActiveScene((current) => {
        const next = (HERO_SCENES.indexOf(current) + 1) % HERO_SCENES.length;
        return HERO_SCENES[next] ?? HERO_SCENES[0];
      });
    }, HERO_ROTATION_MS);
    return () => clearInterval(id);
  }, [activeScene, prefersReducedMotion, isHovered, isFocused, isTabHidden]);

  // WAI-ARIA tabs: arrows / Home / End move between chips (roving tabindex).
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = HERO_SCENES.indexOf(activeScene);
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (index + 1) % HERO_SCENES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (index - 1 + HERO_SCENES.length) % HERO_SCENES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = HERO_SCENES.length - 1;
    if (next === null) return;
    e.preventDefault();
    const scene = HERO_SCENES[next];
    if (!scene) return;
    setActiveScene(scene);
    tabRefs.current[scene]?.focus();
  };

  const currentDef = HERO_SCENE_DEFINITIONS[activeScene];

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

        {/* Chips + preview: hovering or focusing anywhere in here pauses the rotation */}
        <div
          data-testid="hero-scenes"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setIsFocused(false);
          }}
        >
          {/* Scene Selection Chips (Tablist) */}
          <div
            role="tablist"
            aria-label={t("scenesTablistLabel")}
            className="mx-auto mt-12 mb-4 flex flex-wrap items-center justify-center gap-2"
          >
            {HERO_SCENES.map((sceneKey) => {
              const def = HERO_SCENE_DEFINITIONS[sceneKey];
              const IconComponent = SCENE_ICONS[def.iconName];
              const isSelected = activeScene === sceneKey;

              return (
                <button
                  key={sceneKey}
                  ref={(el) => {
                    tabRefs.current[sceneKey] = el;
                  }}
                  role="tab"
                  type="button"
                  id={`hero-scene-tab-${sceneKey}`}
                  aria-selected={isSelected}
                  aria-controls={`hero-scene-panel-${sceneKey}`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setActiveScene(sceneKey)}
                  onKeyDown={handleTabKeyDown}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-accent text-accent-fg ring-accent shadow-xs ring-1"
                      : "border-border/80 bg-surface text-fg-muted hover:text-fg hover:bg-surface-2 border"
                  )}
                >
                  <IconComponent
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{t(`scenes.${sceneKey}.label`)}</span>
                </button>
              );
            })}
          </div>

          {/* Realistic Product UI Preview */}
          <div className="relative mx-auto max-w-4xl text-left">
            <div className="border-border bg-surface overflow-hidden rounded-2xl border shadow-md">
              {/* Window Chrome / Title Bar */}
              <div className="border-border/80 bg-surface-2/80 text-fg-muted flex items-center justify-between border-b px-4 py-2.5 text-xs select-none">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex shrink-0 gap-1.5">
                    <div className="bg-danger/60 h-2.5 w-2.5 rounded-full" />
                    <div className="bg-warning/60 h-2.5 w-2.5 rounded-full" />
                    <div className="bg-success/60 h-2.5 w-2.5 rounded-full" />
                  </div>
                  <span className="text-fg-subtle ml-2 truncate font-mono text-[11px]">
                    {t("mockPath", { slug: currentDef.slug })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-border/80 bg-surface shrink-0 font-mono text-[10px] whitespace-nowrap"
                  >
                    {t("modelBadge")}
                  </Badge>
                </div>
              </div>

              {/*
                Every scene is rendered in the same grid cell, so the preview is always as tall as
                the tallest scene (no layout shift on rotation) and scenes cross-fade in 300 ms.
                Inactive scenes are aria-hidden + inert.
              */}
              <div className="grid">
                {HERO_SCENES.map((sceneKey) => (
                  <HeroScene
                    key={sceneKey}
                    sceneKey={sceneKey}
                    active={sceneKey === activeScene}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroScene({
  sceneKey,
  active,
}: {
  sceneKey: HeroSceneKey;
  active: boolean;
}) {
  const t = useTranslations("Marketing.hero");
  const def = HERO_SCENE_DEFINITIONS[sceneKey];

  const otherProjects = t.raw(`scenes.${sceneKey}.otherProjects`) as string[];
  const [activeWorkspace, ...otherWorkspaces] = t.raw(
    `scenes.${sceneKey}.workspaces`
  ) as string[];
  // code / quote: a string; checklist: string[]; table: string[][] (rows of cells).
  const artifact = t.raw(`scenes.${sceneKey}.artifact`) as
    string | string[] | string[][];
  const artifactLines = (
    Array.isArray(artifact) ? artifact : [artifact]
  ).filter((line): line is string => typeof line === "string");
  const tableRows = Array.isArray(artifact)
    ? artifact.filter((row): row is string[] => Array.isArray(row))
    : [];

  return (
    <div
      id={`hero-scene-panel-${sceneKey}`}
      role="tabpanel"
      aria-labelledby={`hero-scene-tab-${sceneKey}`}
      aria-live="off"
      aria-hidden={!active}
      inert={!active}
      data-scene={sceneKey}
      className={cn(
        "col-start-1 row-start-1 grid grid-cols-1 transition-opacity duration-300 motion-reduce:transition-none md:grid-cols-12",
        active ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
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
              <span className="truncate">
                {t(`scenes.${sceneKey}.activeProject`)}
              </span>
            </div>
            {otherProjects.map((proj) => (
              <div
                key={proj}
                className="text-fg-muted flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{proj}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-fg-subtle px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
            {t("workspacesInProject")}
          </div>
          <div className="mt-1 space-y-0.5">
            <div className="bg-surface border-border/60 text-fg flex items-center justify-between rounded-md border px-2 py-1.5 font-medium shadow-2xs">
              <span className="truncate">{activeWorkspace}</span>
              <span className="text-accent text-[10px]">{t("active")}</span>
            </div>
            {otherWorkspaces.map((ws) => (
              <div
                key={ws}
                className="text-fg-muted flex items-center justify-between rounded-md px-2 py-1.5"
              >
                <span className="truncate">{ws}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Workspace Stream Area */}
      <div className="bg-bg col-span-1 flex flex-col justify-between space-y-4 p-4 sm:p-5 md:col-span-8">
        {/* User Prompt */}
        <div className="flex justify-end">
          <div className="bg-surface-2 border-border text-fg max-w-[90%] rounded-2xl rounded-tr-xs border px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs">
            {t(`scenes.${sceneKey}.prompt`)}
          </div>
        </div>

        {/* Response Card */}
        <div className="border-border bg-surface space-y-3 rounded-xl border p-4 shadow-2xs">
          {/* Thinking Panel Pill */}
          <div className="border-accent/20 bg-accent-soft/40 text-accent flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium">
            <Brain className="h-3.5 w-3.5 shrink-0 motion-safe:animate-pulse" />
            <span>{t(`scenes.${sceneKey}.thought`)}</span>
          </div>

          {/* Versions Badge */}
          <div className="border-border/60 flex items-center justify-between border-b pb-2 text-xs">
            <div className="text-fg-muted flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              <History className="text-accent h-3.5 w-3.5" />
              <span>{t(`scenes.${sceneKey}.versionInfo`)}</span>
              <span className="text-fg-subtle">{t("regeneratedNote")}</span>
            </div>
          </div>

          {/* Response Body with Highlight Callout */}
          <div className="text-fg space-y-2 text-xs leading-relaxed">
            <p>
              {t(`scenes.${sceneKey}.responseBefore`)}{" "}
              <span className="bg-accent/20 text-fg border-accent rounded border-b px-1 py-0.5 font-medium">
                {t(`scenes.${sceneKey}.responseHighlight`)}
              </span>{" "}
              {t(`scenes.${sceneKey}.responseAfter`)}
            </p>

            {/* Interactive Annotation Popover Simulation */}
            <div className="border-accent/40 bg-accent text-accent-fg inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm">
              <MessageSquarePlus className="h-3 w-3" />
              <span>{t("askPassage")}</span>
              <ChevronRight className="h-3 w-3 opacity-70" />
            </div>

            {/* Artifact by scene type */}
            {def.artifactType === "code" && (
              <div className="border-border bg-surface-2 text-fg-muted overflow-x-auto rounded-lg border p-2.5 font-mono text-[11px]">
                <code>{artifactLines.join("\n")}</code>
              </div>
            )}

            {def.artifactType === "table" && (
              <div className="border-border bg-surface-2 text-fg-muted overflow-x-auto rounded-lg border text-[11px]">
                <table className="w-full border-collapse">
                  <tbody>
                    {tableRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx !== 0 ? "border-border/60 border-t" : ""
                        }
                      >
                        {row.map((col, cIdx) => (
                          <td
                            key={cIdx}
                            className={cn(
                              "px-2.5 py-1.5",
                              cIdx === 0
                                ? "text-fg font-medium"
                                : "text-fg-muted"
                            )}
                          >
                            {col}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {def.artifactType === "checklist" && (
              <ul className="border-border bg-surface-2 space-y-1.5 rounded-lg border p-2.5 text-[11px]">
                {artifactLines.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="text-accent mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="text-fg-muted">{item}</span>
                  </li>
                ))}
              </ul>
            )}

            {def.artifactType === "quote" && (
              <blockquote className="border-accent/40 text-fg-muted border-l-2 pl-3 text-[11px] italic">
                {artifactLines.join(" ")}
              </blockquote>
            )}
          </div>
        </div>

        {/* Sub-question branch preview */}
        <div className="border-accent/30 space-y-1 border-l-2 pl-4">
          <div className="text-fg-muted flex items-center gap-1 text-[11px] font-medium">
            <CornerDownRight className="text-accent h-3 w-3" />
            <span>{t(`scenes.${sceneKey}.sideQuestion`)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketingHero;
