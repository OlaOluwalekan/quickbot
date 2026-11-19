"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  MarketingPricingTable,
  MarketingFAQ,
  MarketingCTA,
} from "@/components/marketing";
import { useSiteConfig } from "@/components/providers/site-config-provider";
import { PLANS, getDailyCapForPlan } from "@/server/billing/plans";
import { PLAN_ORDER } from "@/lib/entitlements/shared";

export function PricingView() {
  const t = useTranslations("Marketing.pricingPage");
  const tc = useTranslations("Marketing.pricing.comparison");
  const { billingEnabled } = useSiteConfig();

  return (
    <div className="flex flex-col w-full py-6">
      {/* Page Title Header */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center pt-8 pb-4">
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-fg">
          {t("heading")}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-fg-muted max-w-2xl mx-auto leading-relaxed">
          {t("subheading")}
        </p>
      </div>

      <MarketingPricingTable />

      {/* Feature Comparison Table */}
      <section className="py-12 border-t border-border/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-fg">
              {tc("title")}
            </h2>
            <p className="text-sm text-fg-muted">
              {tc("subtitle")}
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-2xs">
            <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-fg font-semibold">
                  <th className="p-4">{tc("capability")}</th>
                  <th className="p-4">{tc("free")}</th>
                  <th className="p-4">{tc("lite")}</th>
                  <th className="p-4 text-accent">{tc("standard")}</th>
                  <th className="p-4">{tc("pro")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-fg-muted">
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("monthlyCredits")}</td>
                  <td className="p-4 font-mono">{100}</td>
                  <td className="p-4 font-mono">{800}</td>
                  <td className="p-4 font-mono text-fg font-semibold">{1800}</td>
                  <td className="p-4 font-mono">{3500}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("dailyCap")}</td>
                  <td className="p-4">{tc("capCredits", { count: getDailyCapForPlan("FREE") })}</td>
                  <td className="p-4">{tc("capCredits", { count: getDailyCapForPlan("LITE") })}</td>
                  <td className="p-4">{tc("capCredits", { count: getDailyCapForPlan("STANDARD") })}</td>
                  <td className="p-4">{tc("capCredits", { count: getDailyCapForPlan("PRO") })}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("concurrentTurns")}</td>
                  <td className="p-4">{tc("turn1")}</td>
                  <td className="p-4">{tc("turns2")}</td>
                  <td className="p-4">{tc("turns3")}</td>
                  <td className="p-4">{tc("turns5")}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("modelAccess")}</td>
                  <td className="p-4">{tc("economyOnly")}</td>
                  <td className="p-4">{tc("economyStandard")}</td>
                  <td className="p-4">{tc("economyStandard")}</td>
                  <td className="p-4">{tc("economyStandard")}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("imageSynthesis")}</td>
                  <td className="p-4 text-fg-subtle">{tc("no")}</td>
                  <td className="p-4 text-success font-medium">{tc("yesApprox")}</td>
                  <td className="p-4 text-success font-medium">{tc("yesApprox")}</td>
                  <td className="p-4 text-success font-medium">{tc("yesApprox")}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("attachments")}</td>
                  <td className="p-4">{tc("files3")}</td>
                  <td className="p-4">{tc("files10")}</td>
                  <td className="p-4">{tc("files25")}</td>
                  <td className="p-4">{tc("files50")}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("documentExports")}</td>
                  <td className="p-4">{tc("markdownOnly")}</td>
                  <td className="p-4">{tc("allExportFormats")}</td>
                  <td className="p-4">{tc("allExportFormats")}</td>
                  <td className="p-4">{tc("allExportFormats")}</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("teamMembers")}</td>
                  {PLAN_ORDER.map((plan) => (
                    <td key={plan} className="p-4">
                      {tc("collaborators", { count: PLANS[plan].limits.members })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-4 font-medium text-fg">{tc("responseVersions")}</td>
                  <td className="p-4 text-success">{tc("unlimited")}</td>
                  <td className="p-4 text-success">{tc("unlimited")}</td>
                  <td className="p-4 text-success">{tc("unlimited")}</td>
                  <td className="p-4 text-success">{tc("unlimited")}</td>
                </tr>
                {/* Cancellation exists only once billing is live (rule 9). */}
                {billingEnabled && (
                  <tr>
                    <td className="p-4 font-medium text-fg">{tc("inAppCancel")}</td>
                    <td className="p-4 text-fg-subtle">{tc("notApplicable")}</td>
                    <td className="p-4 text-success">{tc("anytime")}</td>
                    <td className="p-4 text-success">{tc("anytime")}</td>
                    <td className="p-4 text-success">{tc("anytime")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <MarketingFAQ />
      <MarketingCTA />
    </div>
  );
}

export default PricingView;
