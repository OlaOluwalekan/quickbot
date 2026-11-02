import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Compass,
  Search,
  Home,
  MessageSquare,
  HelpCircle,
  LifeBuoy,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Logo from "@/components/logo/Logo";
import AppName from "@/components/logo/AppName";

export const metadata: Metadata = {
  title: "Page Not Found · Klecx",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function NotFoundPage() {
  const t = await getTranslations("Errors");

  const helpfulLinks = [
    { href: "/", label: t("notFound.homeLink"), icon: Home },
    {
      href: "/workspaces",
      label: t("notFound.workspacesLink"),
      icon: MessageSquare,
    },
    { href: "/help", label: t("notFound.helpLink"), icon: HelpCircle },
    { href: "/support", label: t("notFound.supportLink"), icon: LifeBuoy },
    { href: "/status", label: t("notFound.statusLink"), icon: Activity },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between bg-bg text-fg px-4 py-8">
      {/* Top Bar with Brand */}
      <header className="w-full max-w-4xl flex items-center justify-between pb-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="normal" />
          <AppName />
        </Link>
      </header>

      {/* Main 404 Container */}
      <main className="w-full max-w-2xl my-auto py-8">
        <EmptyState
          icon={<Compass className="h-6 w-6 text-accent" />}
          title={t("notFound.title")}
          description={t("notFound.description")}
          className="border-border/80 bg-surface/90 shadow-sm p-8 sm:p-12"
          action={
            <div className="w-full flex flex-col items-center gap-6 mt-4">
              {/* Search Form */}
              <form
                action="/help"
                method="GET"
                className="w-full max-w-md flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted" />
                  <input
                    type="search"
                    name="q"
                    placeholder={t("notFound.searchPlaceholder")}
                    className="w-full rounded-xl border border-border bg-surface-2/60 pl-9 pr-4 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-hidden focus:ring-2 focus:ring-accent transition-all"
                  />
                </div>
                <Button type="submit" size="sm" className="rounded-xl">
                  {t("notFound.searchButton")}
                </Button>
              </form>

              {/* Helpful Destinations */}
              <div className="w-full pt-4 border-t border-border/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted text-center mb-3">
                  {t("notFound.popularLinksHeading")}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {helpfulLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-fg hover:text-accent hover:border-accent/40 transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5 text-accent" />
                        <span>{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          }
        />
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl text-center text-xs text-fg-subtle pt-6">
        <span>© {new Date().getFullYear()} Klecx. All rights reserved.</span>
      </footer>
    </div>
  );
}
