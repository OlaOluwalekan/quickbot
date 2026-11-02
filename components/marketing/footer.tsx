"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Logo from "@/components/logo/Logo";
import AppName from "@/components/logo/AppName";

export function MarketingFooter() {
  const t = useTranslations("Marketing.footer");
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-border bg-surface-2/60 text-fg-muted">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="md:col-span-1 space-y-3">
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
              <Logo size="icon" />
              <AppName />
            </Link>
            <p className="text-xs text-fg-muted leading-relaxed">
              {t("tagline")}
            </p>
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Mail className="h-3.5 w-3.5 text-accent" />
              <a
                href="mailto:support@klecx.com"
                className="hover:text-fg hover:underline transition-colors font-mono"
              >
                support@klecx.com
              </a>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">{t("productHeading")}</h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/features" className="hover:text-fg transition-colors">
                  {t("features")}
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-fg transition-colors">
                  {t("pricing")}
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-fg transition-colors">
                  {t("about")}
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-fg transition-colors">
                  {t("status")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">{t("legalHeading")}</h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/terms" className="hover:text-fg transition-colors">
                  {t("terms")}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-fg transition-colors">
                  {t("privacy")}
                </Link>
              </li>
              <li>
                <Link href="/acceptable-use" className="hover:text-fg transition-colors">
                  {t("acceptableUse")}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-fg transition-colors">
                  {t("cookies")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust & Independence Disclosure */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              <span>{t("trustTitle")}</span>
            </div>
            <p className="text-xs text-fg-subtle leading-relaxed bg-surface border border-border/70 p-3 rounded-xl shadow-2xs">
              {t("trustDisclosure")}
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-fg-subtle">
          <p>© {currentYear} Klecx. {t("allRightsReserved")}</p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:underline">
              {t("terms")}
            </Link>
            <span>•</span>
            <Link href="/privacy" className="hover:underline">
              {t("privacy")}
            </Link>
            <span>•</span>
            <Link href="/acceptable-use" className="hover:underline">
              {t("acceptableUse")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default MarketingFooter;
