"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ShieldCheck,
  Mail,
  Scale,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteConfig } from "@/components/providers/site-config-provider";

export function AboutView() {
  const t = useTranslations("Marketing.aboutPage");
  const site = useSiteConfig();

  return (
    <div className="flex flex-col w-full py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/20 bg-accent-soft text-accent text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t("badge")}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-fg">
            {t("heading")}
          </h1>
          <p className="text-base sm:text-lg text-fg-muted max-w-2xl mx-auto leading-relaxed">
            {t("subheading")}
          </p>
        </div>

        {/* Narrative Section */}
        <div className="prose prose-neutral dark:prose-invert max-w-none text-sm sm:text-base leading-relaxed text-fg space-y-6">
          <div className="p-6 rounded-2xl border border-border bg-surface shadow-2xs space-y-4">
            <h2 className="text-xl font-bold text-fg">{t("threadProblemTitle")}</h2>
            <p className="text-fg-muted leading-relaxed">
              {t("threadProblemIntro")}
            </p>
            <ul className="space-y-2 text-fg-muted list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="text-danger font-bold">•</span>
                <span>{t("threadBullet1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-danger font-bold">•</span>
                <span>{t("threadBullet2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-danger font-bold">•</span>
                <span>{t("threadBullet3")}</span>
              </li>
            </ul>
            <p className="text-fg-muted leading-relaxed">
              {t("threadProblemOutro")}
            </p>
          </div>

          {/* Third-Party Model Disclosure */}
          <div className="p-6 rounded-2xl border border-accent/30 bg-accent-soft/30 space-y-3">
            <div className="flex items-center gap-2 text-accent font-semibold text-sm">
              <ShieldCheck className="h-4 w-4" />
              <span>{t("disclosureBadge")}</span>
            </div>
            <p className="text-xs sm:text-sm text-fg leading-relaxed">
              {t("disclosureText")}
            </p>
          </div>

          {/* Privacy & Honesty Standards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="p-5 rounded-xl border border-border bg-surface space-y-2">
              <div className="flex items-center gap-2 font-bold text-fg">
                <Lock className="h-4 w-4 text-accent" />
                <span>{t("privateTitle")}</span>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                {t("privateText")}
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border bg-surface space-y-2">
              <div className="flex items-center gap-2 font-bold text-fg">
                <Scale className="h-4 w-4 text-accent" />
                <span>{t("noFakeTitle")}</span>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                {t("noFakeText")}
              </p>
            </div>
          </div>

          {/* Contact and Support */}
          <div className="p-6 rounded-2xl border border-border bg-surface space-y-4">
            <h2 className="text-lg font-bold text-fg flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent" />
              <span>{t("supportTitle")}</span>
            </h2>
            <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
              {t("supportText")}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs font-mono">
                <span className="text-fg-subtle">{t("emailLabel")}</span>
                <a
                  href={`mailto:${site.emails.support}`}
                  className="text-accent hover:underline font-semibold"
                >
                  {site.emails.support}
                </a>
              </div>
              <Button asChild size="sm">
                <Link href="/auth/register">{t("tryFree")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AboutView;
