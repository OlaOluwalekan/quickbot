"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Menu, Moon, Sun, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Logo from "@/components/logo/Logo";
import AppName from "@/components/logo/AppName";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export function MarketingHeader() {
  const pathname = usePathname();
  const t = useTranslations("Marketing.nav");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const navLinks = [
    { label: t("features"), href: "/features" },
    { label: t("pricing"), href: "/pricing" },
    { label: t("about"), href: "/about" },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-bg/85 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Logo size="icon" />
          <AppName />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors hover:text-fg",
                  isActive ? "text-fg font-semibold" : "text-fg-muted"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop Right Utilities */}
        <div className="hidden md:flex items-center gap-3">
          <LocaleSwitcher compact />

          {mounted && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={t("toggleTheme")}
              className="h-8 w-8 text-fg-muted hover:text-fg rounded-lg"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}

          <Button asChild variant="ghost" size="sm" className="text-fg-muted hover:text-fg">
            <Link href="/auth/login">{t("signIn")}</Link>
          </Button>

          <Button asChild size="sm" className="bg-accent text-accent-fg hover:bg-accent-hover shadow-2xs">
            <Link href="/auth/register" className="flex items-center gap-1.5">
              <span>{t("startFree")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile Menu Toggle Button */}
        <div className="flex md:hidden items-center gap-2">
          {mounted && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={t("toggleTheme")}
              className="h-8 w-8 text-fg-muted hover:text-fg"
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? t("closeMenu") : t("openMenu")}
            className="h-9 w-9 text-fg"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-surface px-4 py-5 shadow-lg animate-in slide-in-from-top-2">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-accent-soft text-accent font-semibold"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                )}
              >
                {link.label}
              </Link>
            ))}

            <div className="pt-3 mt-2 border-t border-border flex flex-col gap-3">
              <div className="flex items-center justify-between px-3">
                <span className="text-xs text-fg-muted font-medium">{t("language")}</span>
                <LocaleSwitcher />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                    {t("signIn")}
                  </Link>
                </Button>
                <Button asChild size="sm" className="w-full bg-accent text-accent-fg hover:bg-accent-hover">
                  <Link href="/auth/register" onClick={() => setMobileMenuOpen(false)}>
                    {t("startFree")}
                  </Link>
                </Button>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

export default MarketingHeader;
