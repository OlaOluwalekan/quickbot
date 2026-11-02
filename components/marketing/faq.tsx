"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQ_KEYS = [
  "creditDef",
  "rollover",
  "cancel",
  "refund",
  "models",
  "privacy",
] as const;

export function MarketingFAQ() {
  const t = useTranslations("Marketing.faq");
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-12 md:py-20 border-t border-border/60">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/20 bg-accent-soft text-accent text-xs font-semibold">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>{t("badge")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {t("heading")}
          </h2>
          <p className="text-sm sm:text-base text-fg-muted">
            {t("subheading")}
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_KEYS.map((key, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={key}
                className={cn(
                  "rounded-2xl border transition-all duration-200 overflow-hidden",
                  isOpen
                    ? "border-accent/40 bg-surface shadow-2xs"
                    : "border-border bg-surface-2/40 hover:border-border-strong hover:bg-surface-2"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-sm sm:text-base font-semibold text-fg cursor-pointer transition-colors"
                >
                  <span className="pr-4">{t(`items.${key}.q`)}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200",
                      isOpen && "rotate-180 text-accent"
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-5 sm:px-5 sm:pb-5 text-xs sm:text-sm text-fg-muted leading-relaxed border-t border-border/50 pt-3">
                    {t(`items.${key}.a`)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default MarketingFAQ;
