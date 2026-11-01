"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Coins, Sparkles } from "lucide-react";
import { formatNumber } from "@/utils/format";
import { Button } from "@/components/ui/button";
import type { HomeCredits } from "@/lib/api/hooks/home";

export interface CreditsCardProps {
  credits: HomeCredits;
}

export function CreditsCard({ credits }: CreditsCardProps) {
  const tHome = useTranslations("Home");
  const isFree = credits.plan.toLowerCase() === "free";

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
              {credits.plan}
            </span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            <span className="font-semibold text-fg text-sm">
              {formatNumber(credits.balance)}
            </span>{" "}
            credits remaining
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button asChild size="sm" variant={isFree ? "default" : "outline"}>
          <Link href="/settings" className="gap-1.5 text-xs font-semibold">
            {isFree && <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />}
            <span>{isFree ? tHome("upgradePlan") : tHome("managePlan")}</span>
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default CreditsCard;
