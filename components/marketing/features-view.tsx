"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  MarketingFeatureList,
  MarketingCTA,
} from "@/components/marketing";
import { Layers } from "lucide-react";

export function FeaturesView() {
  const t = useTranslations("Marketing.featuresPage");

  return (
    <div className="flex flex-col w-full py-6">
      {/* Page Header */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center pt-8 pb-6 space-y-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/20 bg-accent-soft text-accent text-xs font-semibold">
          <Layers className="h-3.5 w-3.5" />
          <span>{t("badge")}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-fg">
          {t("heading")}
        </h1>
        <p className="text-base sm:text-lg text-fg-muted max-w-2xl mx-auto leading-relaxed">
          {t("subheading")}
        </p>
      </div>

      <MarketingFeatureList />

      {/* Deep-Dive Grid */}
      <section className="py-12 border-t border-border/60 bg-surface-2/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg">
              {t("principlesHeading")}
            </h2>
            <p className="text-sm text-fg-muted">
              {t("principlesSubheading")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-border bg-surface shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center font-bold">
                01
              </div>
              <h3 className="text-base font-bold text-fg">{t("p1Title")}</h3>
              <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
                {t("p1Desc")}
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-surface shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center font-bold">
                02
              </div>
              <h3 className="text-base font-bold text-fg">{t("p2Title")}</h3>
              <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
                {t("p2Desc")}
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-border bg-surface shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center font-bold">
                03
              </div>
              <h3 className="text-base font-bold text-fg">{t("p3Title")}</h3>
              <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
                {t("p3Desc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <MarketingCTA />
    </div>
  );
}

export default FeaturesView;
