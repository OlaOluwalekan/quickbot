"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PlanKey } from "@/server/billing/plans";

export function MarketingPricingTable({
  isTeaser: _isTeaser = false,
}: {
  isTeaser?: boolean;
}) {
  const t = useTranslations("Marketing.pricing");
  const [billingCycle, setBillingCycle] = React.useState<"month" | "year">("month");

  const planKeys: PlanKey[] = ["FREE", "LITE", "STANDARD", "PRO"];

  return (
    <section id="pricing" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/20 bg-accent-soft text-accent text-xs font-semibold">
            <span>{t("badge")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("heading")}
          </h2>
          <p className="text-sm sm:text-base text-fg-muted">
            {t("subheading")}
          </p>

          {/* Monthly / Yearly Toggle */}
          <div className="pt-4 flex items-center justify-center">
            <div className="inline-flex items-center p-1 rounded-xl border border-border bg-surface-2 shadow-2xs">
              <button
                type="button"
                onClick={() => setBillingCycle("month")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  billingCycle === "month"
                    ? "bg-surface text-fg shadow-xs"
                    : "text-fg-muted hover:text-fg"
                )}
              >
                {t("monthlyBilling")}
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("year")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                  billingCycle === "year"
                    ? "bg-surface text-fg shadow-xs"
                    : "text-fg-muted hover:text-fg"
                )}
              >
                <span>{t("yearlyBilling")}</span>
                <span className="px-1.5 py-0.5 rounded-full bg-accent-soft text-accent text-[10px] font-bold">
                  {t("twoMonthsFree")}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {planKeys.map((key) => {
            const plan = PLANS[key];
            const isPopular = plan.popular;
            const price = billingCycle === "year" ? plan.priceYearly : plan.priceMonthly;
            const period = billingCycle === "year" ? t("perYear") : t("perMonth");

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-200",
                  isPopular
                    ? "border-accent bg-surface shadow-md ring-1 ring-accent"
                    : "border-border bg-surface shadow-2xs hover:border-border-strong"
                )}
              >
                {/* Popular Badge */}
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-accent text-accent-fg px-3 py-0.5 text-xs font-semibold shadow-xs">
                      {t("mostPopular")}
                    </Badge>
                  </div>
                )}

                {/* Card Top */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-fg">
                      {t(`plans.${plan.id}.name`)}
                    </h3>
                    <p className="mt-1 text-xs text-fg-muted leading-relaxed min-h-[32px]">
                      {t(`plans.${plan.id}.tagline`)}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                      ${price}
                    </span>
                    <span className="text-xs text-fg-muted font-medium">{period}</span>
                  </div>

                  {/* Credit Metric */}
                  <div className="p-3 rounded-xl border border-border/80 bg-surface-2 text-xs space-y-1">
                    <div className="font-semibold text-fg flex items-center justify-between">
                      <span>{plan.credits.toLocaleString()} Credits</span>
                      <span className="text-[10px] text-fg-subtle">{t("creditsRenewed")}</span>
                    </div>
                    <div className="text-[11px] text-fg-muted">
                      {plan.dailyCapCredits
                        ? t("dailyCapFixed", { credits: plan.dailyCapCredits })
                        : t("dailyCapPercent", { percent: Math.round((plan.dailyCapPct || 0.25) * 100) })}
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                      {t("includedHeading")}
                    </div>
                    <ul className="space-y-2 text-xs">
                      {plan.features.map((_, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-fg/90">
                          <Check className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                          <span>{t(`plans.${plan.id}.f${idx + 1}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action CTA */}
                <div className="pt-6 mt-6 border-t border-border/60">
                  <Button
                    asChild
                    variant={isPopular ? "default" : "outline"}
                    className={cn(
                      "w-full text-xs font-semibold h-9",
                      isPopular
                        ? "bg-accent text-accent-fg hover:bg-accent-hover shadow-2xs"
                        : "border-border text-fg hover:bg-surface-2"
                    )}
                  >
                    <Link href={plan.id === "FREE" ? "/auth/register" : `/auth/register?plan=${plan.id.toLowerCase()}`}>
                      {plan.id === "FREE"
                        ? t("startFree")
                        : t("subscribeTo", { name: t(`plans.${plan.id}.name`) })}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Transparent Credit Breakdown Footnote */}
        <div className="mt-12 p-6 rounded-2xl border border-border bg-surface-2/60 text-xs text-fg-muted space-y-3">
          <div className="font-semibold text-fg flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-accent" />
            <span>{t("footnoteTitle")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-surface border border-border/60 space-y-1">
              <span className="font-semibold text-fg">{t("standardTurnTitle")}</span>
              <p className="text-[11px] text-fg-subtle">{t("standardTurnDesc")}</p>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/60 space-y-1">
              <span className="font-semibold text-fg">{t("imageGenTitle")}</span>
              <p className="text-[11px] text-fg-subtle">{t("imageGenDesc")}</p>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/60 space-y-1">
              <span className="font-semibold text-fg">{t("groundingTitle")}</span>
              <p className="text-[11px] text-fg-subtle">{t("groundingDesc")}</p>
            </div>
          </div>
          <p className="text-[11px] text-fg-subtle pt-1">
            {t("footnoteDisclaimer")}
          </p>
        </div>
      </div>
    </section>
  );
}

export default MarketingPricingTable;
