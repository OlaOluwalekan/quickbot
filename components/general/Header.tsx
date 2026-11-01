"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import LocaleSwitcher from "./LocaleSwitcher";
import AppName from "../logo/AppName";
import Logo from "../logo/Logo";
import LinkButton from "../ui/button/LinkButton";

const Header = () => {
  const t = useTranslations("Header");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-surface/80 backdrop-blur-md transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
        {/* Brand & Desktop Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex gap-2.5 items-center group">
            <Logo size="icon" />
            <AppName />
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#features"
              className="text-sm font-medium text-muted hover:text-accent transition-colors"
            >
              {t("features")}
            </a>
            <Link
              href="/workspaces"
              className="text-sm font-medium text-muted hover:text-accent transition-colors"
            >
              {t("dashboard")}
            </Link>
          </nav>
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          <LocaleSwitcher />
          <LinkButton
            size="small"
            type="button"
            text={t("login")}
            theme="outline"
            href="/auth/login"
          />
          <LinkButton
            size="small"
            type="button"
            text={t("register")}
            theme="primary"
            href="/auth/register"
          />
        </div>

        {/* Mobile Hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <LocaleSwitcher compact />
          <button
            type="button"
            aria-label="Toggle Menu"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 rounded-xl border border-border text-fg hover:bg-surface-2 cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" strokeWidth={1.5} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-surface px-4 py-4 flex flex-col gap-3 shadow-lg">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg text-sm font-medium text-fg hover:bg-surface-2"
          >
            {t("features")}
          </a>
          <Link
            href="/workspaces"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg text-sm font-medium text-fg hover:bg-surface-2"
          >
            {t("dashboard")}
          </Link>
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border">
            <LinkButton
              size="full"
              type="button"
              text={t("login")}
              theme="outline"
              href="/auth/login"
            />
            <LinkButton
              size="full"
              type="button"
              text={t("register")}
              theme="primary"
              href="/auth/register"
            />
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
