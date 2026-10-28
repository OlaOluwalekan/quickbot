"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { FaBars, FaXmark } from "react-icons/fa6";
import LocaleSwitcher from "./LocaleSwitcher";
import AppName from "../logo/AppName";
import Logo from "../logo/Logo";
import LinkButton from "../ui/button/LinkButton";

const Header = () => {
  const t = useTranslations("Header");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md transition-colors">
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
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {t("features")}
            </a>
            <Link
              href="/workspaces"
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
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
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
          >
            {mobileMenuOpen ? <FaXmark /> : <FaBars />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 flex flex-col gap-3 shadow-xl">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            {t("features")}
          </a>
          <Link
            href="/workspaces"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            {t("dashboard")}
          </Link>
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
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
