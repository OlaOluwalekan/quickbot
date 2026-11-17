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
import {
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

export function MarketingHero() {
  const t = useTranslations("Marketing.hero");

  const [activeScene, setActiveScene] = React.useState<HeroSceneKey>("software");
  const [isFading, setIsFading] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);
  const [isTabHidden, setIsTabHidden] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return Boolean(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    return false;
  });

  // Detect prefers-reduced-motion and tab visibility changes
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

      const motionHandler = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(Boolean(e.matches));
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", motionHandler);
      } else if ("addListener" in mediaQuery) {
        // Fallback for older browsers/jsdom
        (mediaQuery as unknown as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(motionHandler);
      }
    }

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined") {
        setIsTabHidden(document.visibilityState === "hidden");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Smooth cross-fade transition when changing scene
  const handleSelectScene = React.useCallback(
    (nextScene: HeroSceneKey) => {
      if (nextScene === activeScene) return;
      if (prefersReducedMotion) {
        setActiveScene(nextScene);
        return;
      }
      setIsFading(true);
      setTimeout(() => {
        setActiveScene(nextScene);
        setIsFading(false);
      }, 150);
    },
    [activeScene, prefersReducedMotion]
  );

  // Auto-rotation every 7 seconds, paused on hover, focus, hidden tab, or reduced motion
  React.useEffect(() => {
    if (prefersReducedMotion || isHovered || isFocused || isTabHidden) {
      return;
    }

    const interval = setInterval(() => {
      const currentIndex = HERO_SCENES.indexOf(activeScene);
      const nextIndex = (currentIndex + 1) % HERO_SCENES.length;
      const nextScene = HERO_SCENES[nextIndex];
      if (nextScene) {
        handleSelectScene(nextScene);
      }
    }, 7000);

    return () => clearInterval(interval);
  }, [
    activeScene,
    prefersReducedMotion,
    isHovered,
    isFocused,
    isTabHidden,
    handleSelectScene,
  ]);

  const currentDef = HERO_SCENE_DEFINITIONS[activeScene];

  const getRaw = React.useCallback(
    (key: string) => {
      if (typeof t.raw === "function") {
        try {
          return t.raw(key);
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
    [t]
  );

  // Retrieve localized scene data
  const rawOtherProjects = getRaw(`scenes.${activeScene}.otherProjects`);
  const otherProjects: string[] = Array.isArray(rawOtherProjects)
    ? rawOtherProjects
    : ["Project 2", "Project 3"];

  const rawWorkspaces = getRaw(`scenes.${activeScene}.workspaces`);
  const workspaces: string[] = Array.isArray(rawWorkspaces)
    ? rawWorkspaces
    : ["Workspace 1", "Workspace 2", "Workspace 3"];

  const rawArtifact = getRaw(`scenes.${activeScene}.artifact`);

  const tableRows = React.useMemo(() => {
    if (currentDef.artifactType !== "table" || !Array.isArray(rawArtifact)) return [];
    return (rawArtifact as string[]).map((rowStr) =>
      rowStr.split("|").map((c) => c.trim())
    );
  }, [currentDef.artifactType, rawArtifact]);

  const checklistItems = React.useMemo(() => {
    if (currentDef.artifactType !== "checklist" || !Array.isArray(rawArtifact)) return [];
    return rawArtifact as string[];
  }, [currentDef.artifactType, rawArtifact]);

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
                role="tab"
                type="button"
                id={`hero-scene-tab-${sceneKey}`}
                aria-selected={isSelected}
                aria-controls="hero-scene-preview"
                onClick={() => handleSelectScene(sceneKey)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-accent text-accent-fg shadow-xs ring-1 ring-accent"
                    : "border-border/80 bg-surface text-fg-muted hover:text-fg hover:bg-surface-2 border"
                }`}
              >
                <IconComponent className="h-3.5 w-3.5 shrink-0" />
                <span>{t(`scenes.${sceneKey}.label`)}</span>
              </button>
            );
          })}
        </div>

        {/* Realistic Product UI Preview */}
        <div
          id="hero-scene-preview"
          role="tabpanel"
          aria-labelledby={`hero-scene-tab-${activeScene}`}
          aria-live="off"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="relative mx-auto max-w-4xl text-left"
        >
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
                  {t("mockPath", { slug: currentDef.slug })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-border/80 bg-surface font-mono text-[10px]"
                >
                  {t("modelBadge")}
                </Badge>
              </div>
            </div>

            {/* Simulated Workspace Shell */}
            <div
              className={`grid min-h-[460px] grid-cols-1 transition-opacity duration-300 md:grid-cols-12 ${
                isFading ? "opacity-0" : "opacity-100"
              }`}
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
                        {t(`scenes.${activeScene}.activeProject`)}
                      </span>
                    </div>
                    {otherProjects.map((proj, idx) => (
                      <div
                        key={idx}
                        className="text-fg-muted hover:bg-surface-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
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
                      <span className="truncate">{workspaces[0]}</span>
                      <span className="text-accent text-[10px]">
                        {t("active")}
                      </span>
                    </div>
                    {workspaces.slice(1).map((ws, idx) => (
                      <div
                        key={idx}
                        className="text-fg-muted hover:bg-surface-2 flex items-center justify-between rounded-md px-2 py-1.5 transition-colors"
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
                    {t(`scenes.${activeScene}.prompt`)}
                  </div>
                </div>

                {/* Response Card */}
                <div className="border-border bg-surface space-y-3 rounded-xl border p-4 shadow-2xs">
                  {/* Thinking Panel Pill */}
                  <div className="border-accent/20 bg-accent-soft/40 text-accent flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium">
                    <Brain className="h-3.5 w-3.5 animate-pulse" />
                    <span>{t(`scenes.${activeScene}.thought`)}</span>
                  </div>

                  {/* Versions Badge */}
                  <div className="border-border/60 flex items-center justify-between border-b pb-2 text-xs">
                    <div className="text-fg-muted flex items-center gap-1.5 font-mono text-[11px]">
                      <History className="text-accent h-3.5 w-3.5" />
                      <span>{t(`scenes.${activeScene}.versionInfo`)}</span>
                      <span className="text-fg-subtle">
                        {t("regeneratedNote")}
                      </span>
                    </div>
                  </div>

                  {/* Response Body with Highlight Callout */}
                  <div className="text-fg space-y-2 text-xs leading-relaxed">
                    <p>
                      {t(`scenes.${activeScene}.responseBefore`)}{" "}
                      <span className="bg-accent/20 text-fg border-accent rounded border-b px-1 py-0.5 font-medium">
                        {t(`scenes.${activeScene}.responseHighlight`)}
                      </span>{" "}
                      {t(`scenes.${activeScene}.responseAfter`)}
                    </p>

                    {/* Interactive Annotation Popover Simulation */}
                    <div className="border-accent/40 bg-accent text-accent-fg inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm">
                      <MessageSquarePlus className="h-3 w-3" />
                      <span>{t("askPassage")}</span>
                      <ChevronRight className="h-3 w-3 opacity-70" />
                    </div>

                    {/* Dynamic Artifact by Scene Type */}
                    {currentDef.artifactType === "code" && (
                      <div className="border-border bg-surface-2 text-fg-muted overflow-x-auto rounded-lg border p-2.5 font-mono text-[11px]">
                        <code>{String(rawArtifact)}</code>
                      </div>
                    )}

                    {currentDef.artifactType === "table" && tableRows.length > 0 && (
                      <div className="border-border bg-surface-2 text-fg-muted overflow-hidden rounded-lg border text-[11px]">
                        <table className="w-full border-collapse">
                          <tbody>
                            {tableRows.map((cols, rIdx) => (
                              <tr
                                key={rIdx}
                                className={rIdx !== 0 ? "border-border/60 border-t" : ""}
                              >
                                {cols.map((col, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className={`px-2.5 py-1.5 ${
                                      cIdx === 0
                                        ? "font-medium text-fg"
                                        : "text-fg-muted"
                                    }`}
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

                    {currentDef.artifactType === "checklist" && checklistItems.length > 0 && (
                      <div className="border-border bg-surface-2 space-y-1.5 rounded-lg border p-2.5 text-[11px]">
                        {checklistItems.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <CheckCircle2 className="text-accent mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="text-fg-muted">{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-question branch preview */}
                <div className="border-accent/30 space-y-1 border-l-2 pl-4">
                  <div className="text-fg-muted flex items-center gap-1 text-[11px] font-medium">
                    <CornerDownRight className="text-accent h-3 w-3" />
                    <span>{t(`scenes.${activeScene}.sideQuestion`)}</span>
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
