import type { Metadata } from "next";
import { requireActor } from "@/server/auth/session";
import LocaleSwitcher from "@/components/layout/locale-switcher";
import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import { Button } from "@/components/ui/button";
import { SessionsList } from "@/components/settings/SessionsList";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Sessions & Devices — Settings",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SessionsPage() {
  await requireActor();

  return (
    <div className="min-h-screen w-full bg-bg text-fg flex flex-col">
      {/* Top Navbar */}
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link href="/workspaces" className="flex items-center gap-2">
            <Logo size="icon" />
            <AppName />
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <Button asChild variant="outline" size="sm">
              <Link href="/settings" className="flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase">
            <Shield className="w-4 h-4" />
            Security
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Sessions & Devices
          </h1>
          <p className="text-xs sm:text-sm text-muted">
            View all browser and mobile sessions currently authorized to access your account.
          </p>
        </div>

        <div className="w-full bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <SessionsList />
        </div>
      </main>
    </div>
  );
}
