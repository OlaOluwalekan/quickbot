"use client";

import * as React from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Coins, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import type { HomeCredits } from "@/lib/api/hooks/home";
import { PLAN_MANAGE_HREF, PLAN_UPGRADE_HREF } from "@/lib/billing/links";
import { PLANS } from "@/server/billing/plans";

export interface CreditsCardProps {
  credits: HomeCredits;
  /** Hide the plan button, e.g. on the Settings page it links to. */
  showPlanAction?: boolean;
}

export function CreditsCard({ credits, showPlanAction = true }: CreditsCardProps) {
  const tHome = useTranslations("Home");
  const t = useTranslations();
  const format = useFormatter();
  const { billingEnabled } = useSiteConfig();
  const plan = credits.plan in PLANS ? credits.plan : "FREE";
  const isFree = plan === "FREE";

  return (
    <section className="w-full rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <Coins className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-fg flex items-center gap-2">
            <span>{tHome("creditsTitle")}</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent border border-border">
              {t(PLANS[plan].name)}
            </span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            <span className="font-semibold text-fg text-sm">
              {format.number(credits.balance)}
            </span>{" "}
            {tHome("creditsRemaining", { count: credits.balance })}
          </p>
        </div>
      </div>

      {/* Rule 9: plan buttons only while billing is on. */}
      {showPlanAction && billingEnabled && (
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant={isFree ? "default" : "outline"}>
            <Link
              href={isFree ? PLAN_UPGRADE_HREF : PLAN_MANAGE_HREF}
              className="gap-1.5 text-xs font-semibold"
            >
              {isFree && <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />}
              <span>{isFree ? tHome("upgradePlan") : tHome("managePlan")}</span>
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

export default CreditsCard;
