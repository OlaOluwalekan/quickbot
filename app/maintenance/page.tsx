import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wrench, Activity, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Logo from "@/components/logo/Logo";
import AppName from "@/components/logo/AppName";
import { getSiteConfig } from "@/server/config/site";

export const metadata: Metadata = {
  title: "Under Scheduled Maintenance · Klecx",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MaintenancePage() {
  const t = await getTranslations("Errors");
  const site = getSiteConfig();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between bg-bg text-fg px-4 py-8">
      {/* Top Header */}
      <header className="w-full max-w-4xl flex items-center justify-between pb-6">
        <div className="flex items-center gap-2">
          <Logo size="normal" />
          <AppName />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          <span>{t("maintenance.badge")}</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-xl my-auto py-8">
        <EmptyState
          icon={<Wrench className="h-6 w-6 text-accent" />}
          title={t("maintenance.title")}
          description={t("maintenance.description")}
          className="border-border/80 bg-surface/90 shadow-sm p-8 sm:p-10"
          action={
            <div className="w-full flex flex-col items-center gap-4 mt-4">
              <p className="text-xs text-fg-muted text-center max-w-md">
                {t("maintenance.statusNotice")}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  asChild
                  size="sm"
                  className="rounded-xl inline-flex items-center gap-2"
                >
                  <Link href="/status">
                    <Activity className="h-3.5 w-3.5" />
                    <span>{t("maintenance.viewStatus")}</span>
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="rounded-xl inline-flex items-center gap-2"
                >
                  <a href={`mailto:${site.emails.support}`}>
                    <Mail className="h-3.5 w-3.5 text-accent" />
                    <span>{site.emails.support}</span>
                  </a>
                </Button>
              </div>
            </div>
          }
        />
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl text-center text-xs text-fg-subtle pt-6">
        <span>
          © {new Date().getFullYear()} {site.appName} · {site.company.legalName} ·{" "}
          {site.company.address}. All systems monitored 24/7.
        </span>
      </footer>
    </div>
  );
}
