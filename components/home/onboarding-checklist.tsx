"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, CheckCircle2, ChevronRight, Circle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/stores/ui";
import { Button } from "@/components/ui/button";
import type { HomeOnboarding } from "@/lib/api/hooks/home";

export interface OnboardingChecklistProps {
  onboarding: HomeOnboarding;
  onTryTemplate: () => void;
  onRequestNewProject: () => void;
}

export function OnboardingChecklist({
  onboarding,
  onTryTemplate,
  onRequestNewProject,
}: OnboardingChecklistProps) {
  const tHome = useTranslations("Home");
  const onboardingDismissed = useUiStore((s) => s.onboardingDismissed);
  const setOnboardingDismissed = useUiStore((s) => s.setOnboardingDismissed);

  const steps = React.useMemo(() => [
    {
      id: "email",
      label: tHome("stepVerifyEmail"),
      completed: onboarding.emailVerified,
      action: !onboarding.emailVerified ? (
        <Link
          href="/auth/verify/verification"
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
        >
          <span>Verify</span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      ) : null,
    },
    {
      id: "username",
      label: tHome("stepChooseUsername"),
      completed: onboarding.usernameChosen,
      action: !onboarding.usernameChosen ? (
        <Link
          href="/settings"
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5"
        >
          <span>Settings</span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      ) : null,
    },
    {
      id: "template",
      label: tHome("stepTryTemplate"),
      completed: onboarding.hasWorkspace,
      action: !onboarding.hasWorkspace ? (
        <button
          type="button"
          onClick={onTryTemplate}
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          <span>Explore</span>
          <ChevronRight className="h-3 w-3" />
        </button>
      ) : null,
    },
    {
      id: "project",
      label: tHome("stepCreateProject"),
      completed: onboarding.hasProject,
      action: !onboarding.hasProject ? (
        <button
          type="button"
          onClick={onRequestNewProject}
          className="text-xs font-semibold text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
        >
          <span>Create</span>
          <ChevronRight className="h-3 w-3" />
        </button>
      ) : null,
    },
  ], [onboarding, tHome, onTryTemplate, onRequestNewProject]);

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const allCompleted = completedCount === totalCount;

  if (onboardingDismissed || allCompleted) {
    return null;
  }

  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <section className="w-full rounded-2xl border border-accent/20 bg-accent-soft/20 p-4 sm:p-5 relative shadow-xs">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-accent text-accent-fg flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-fg">
              {tHome("onboardingTitle")}
            </h3>
            <p className="text-xs text-muted">
              {tHome("onboardingSubtitle")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={tHome("dismiss")}
          onClick={() => setOnboardingDismissed(true)}
          className="h-7 w-7 text-subtle hover:text-fg -mt-1 -mr-1"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center justify-between text-xs font-medium text-muted">
          <span>{tHome("completedOf", { completed: completedCount, total: totalCount })}</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-accent transition-all duration-300 rounded-full"
          />
        </div>
      </div>

      {/* Steps List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center justify-between p-2.5 rounded-xl border transition-colors",
              step.completed
                ? "bg-surface/60 border-border/60 text-muted"
                : "bg-surface border-border text-fg shadow-xs",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              {step.completed ? (
                <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </div>
              ) : (
                <Circle className="h-5 w-5 text-subtle shrink-0" strokeWidth={1.5} />
              )}
              <span
                className={cn(
                  "text-xs font-medium truncate",
                  step.completed && "line-through text-subtle",
                )}
              >
                {step.label}
              </span>
            </div>

            {step.action && <div className="shrink-0 ml-2">{step.action}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default OnboardingChecklist;
