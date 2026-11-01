"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  Code2,
  Compass,
  Crosshair,
  FileText,
  GraduationCap,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LineChart,
  Megaphone,
  Milestone,
  Network,
  Palette,
  PenLine,
  PenTool,
  Rocket,
  Scale,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STARTER_CATEGORIES,
  STARTER_TEMPLATES,
  type StarterTemplate,
  type TemplateCategory,
} from "@/lib/templates/starter-library";
import { Button } from "@/components/ui/button";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  PenLine,
  BarChart3,
  Search,
  Code2,
  CalendarClock,
  GraduationCap,
  Image: ImageIcon,
  FileText,
  PenTool,
  Megaphone,
  Crosshair,
  Scale,
  LineChart,
  Compass,
  BookOpen,
  Building2,
  Wrench,
  CheckCircle2,
  Network,
  Layers,
  Rocket,
  Milestone,
  Sparkles,
  HelpCircle,
  Camera,
  Palette,
};

export interface StarterLibraryProps {
  onUseTemplate: (template: StarterTemplate) => void;
}

export function StarterLibrary({ onUseTemplate }: StarterLibraryProps) {
  const tHome = useTranslations("Home");
  const tTemplates = useTranslations("Templates");
  const [activeCategory, setActiveCategory] =
    React.useState<TemplateCategory>("write");

  const filteredTemplates = React.useMemo(() => {
    return STARTER_TEMPLATES.filter((t) => t.category === activeCategory);
  }, [activeCategory]);

  return (
    <section className="w-full space-y-4">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-fg flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.5} />
          <span>{tHome("starterLibrary")}</span>
        </h2>
        <p className="text-xs sm:text-sm text-muted mt-0.5">
          {tHome("starterLibrarySubtitle")}
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {STARTER_CATEGORIES.map((cat) => {
          const Icon = ICON_MAP[cat.iconName] || Sparkles;
          const isActive = activeCategory === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 border",
                isActive
                  ? "bg-accent text-accent-fg border-accent shadow-xs"
                  : "bg-surface text-muted border-border hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span>{tTemplates(cat.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTemplates.map((template) => {
          const Icon = ICON_MAP[template.iconName] || Sparkles;

          return (
            <div
              key={template.id}
              className="flex flex-col justify-between p-4 rounded-2xl border border-border bg-surface hover:bg-surface-2 hover:border-border-strong transition-all shadow-xs"
            >
              <div className="mb-3">
                <div className="w-8 h-8 rounded-xl bg-accent-soft border border-border flex items-center justify-center text-accent mb-2.5">
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-fg mb-1">
                  {tTemplates(template.titleKey)}
                </h3>
                <p className="text-xs text-muted leading-relaxed line-clamp-2">
                  {tTemplates(template.descriptionKey)}
                </p>
              </div>

              <div className="pt-2 border-t border-border/50 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onUseTemplate(template)}
                  className="text-xs h-8 gap-1.5 font-medium"
                >
                  <span>{tHome("useTemplate")}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default StarterLibrary;
