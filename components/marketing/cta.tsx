"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MarketingCTA() {
  const t = useTranslations("Marketing.cta");

  return (
    <section className="py-12 md:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl border border-border bg-accent p-8 sm:p-12 md:p-16 text-center text-accent-fg shadow-lg overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-surface/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-fg/15 text-accent-fg text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t("badge")}</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight">
              {t("heading")}
            </h2>

            <p className="text-sm sm:text-base opacity-90 leading-relaxed">
              {t("subheading")}
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto bg-surface text-fg hover:bg-surface-2 font-semibold shadow-xs"
              >
                <Link href="/auth/register" className="flex items-center gap-2">
                  <span>{t("button")}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto border-accent-fg/30 text-accent-fg hover:bg-accent-fg/10 font-semibold"
              >
                <Link href="/pricing">{t("viewPlans")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarketingCTA;
