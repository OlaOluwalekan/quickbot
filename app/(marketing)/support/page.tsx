import * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Mail, Clock, ShieldAlert, BookOpen, ArrowRight } from "lucide-react";
import { SupportForm } from "@/components/support/support-form";

export const metadata = {
  title: "Contact Support · Klecx",
  description: "Get in touch with the Klecx support team. We respond to all inquiries within 3 business days.",
};

export default async function SupportPage() {
  const t = await getTranslations("Support");

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <Mail className="h-3.5 w-3.5" />
            <span>{t("badge")}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-fg">
            {t("title")}
          </h1>
          <p className="text-base text-fg-muted max-w-2xl leading-relaxed">
            {t("headerDesc")}
          </p>
        </div>

        {/* Promised Response Time Banner (Creem requirement: ≤ 3 business days) */}
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 sm:p-5 flex items-start sm:items-center gap-3 text-xs sm:text-sm text-fg">
          <Clock className="h-5 w-5 text-accent shrink-0 mt-0.5 sm:mt-0" />
          <div className="space-y-0.5">
            <span className="font-semibold text-fg">{t("promisedResponse")} </span>
            <span className="text-fg-muted">{t("promisedResponseDesc")}</span>
          </div>
        </div>

        {/* Main Form */}
        <SupportForm />

        {/* Direct Email Cards & Help Link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="rounded-2xl border border-border/70 bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <Mail className="h-4 w-4 text-accent" />
              <span>{t("directInboxHeading")}</span>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              {t("directInboxDesc")}
            </p>
            <a
              href="mailto:support@mail.klecx.vyraxity.com"
              className="inline-block font-mono text-xs text-accent hover:underline"
            >
              support@mail.klecx.vyraxity.com
            </a>
          </div>

          <div className="rounded-2xl border border-border/70 bg-surface p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg">
              <ShieldAlert className="h-4 w-4 text-danger" />
              <span>{t("abuseInboxHeading")}</span>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              {t("abuseInboxDesc")}
            </p>
            <a
              href="mailto:abuse@mail.klecx.vyraxity.com"
              className="inline-block font-mono text-xs text-danger hover:underline"
            >
              abuse@mail.klecx.vyraxity.com
            </a>
          </div>
        </div>

        {/* Search help center shortcut */}
        <div className="rounded-2xl border border-dashed border-border p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-accent shrink-0" />
            <div>
              <span className="font-bold text-fg">{t("quickAnswersHeading")}</span>
              <p className="text-fg-muted">{t("quickAnswersDesc")}</p>
            </div>
          </div>
          <Link
            href="/help"
            className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline shrink-0"
          >
            <span>{t("visitHelpCenter")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
