import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WifiOff, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Logo from "@/components/logo/Logo";
import AppName from "@/components/logo/AppName";

export const metadata: Metadata = {
  title: "Offline · Klecx",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OfflinePage() {
  const t = await getTranslations("Errors");

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between bg-bg text-fg px-4 py-8">
      <header className="w-full max-w-4xl flex items-center justify-between pb-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="normal" />
          <AppName />
        </Link>
      </header>

      <main className="w-full max-w-lg my-auto py-8">
        <EmptyState
          icon={<WifiOff className="h-6 w-6 text-accent" />}
          title={t("offline.message")}
          description={t("offline.reconnecting")}
          className="border-border/80 bg-surface/90 shadow-sm p-8 sm:p-10"
          action={
            <div className="flex items-center gap-3 mt-4">
              <Button
                asChild
                size="sm"
                className="rounded-xl inline-flex items-center gap-2"
              >
                <Link href="/">
                  <Home className="h-3.5 w-3.5" />
                  <span>{t("notFound.homeLink")}</span>
                </Link>
              </Button>
            </div>
          }
        />
      </main>

      <footer className="w-full max-w-4xl text-center text-xs text-fg-subtle pt-6">
        <span>© {new Date().getFullYear()} Klecx.</span>
      </footer>
    </div>
  );
}
