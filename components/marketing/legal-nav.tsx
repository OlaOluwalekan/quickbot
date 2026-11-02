"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Shield, FileText, CheckCircle2, Cookie } from "lucide-react";

export function LegalNav() {
  const pathname = usePathname();
  const t = useTranslations("Marketing.footer");

  const links = [
    { href: "/terms", label: t("terms"), icon: FileText },
    { href: "/privacy", label: t("privacy"), icon: Shield },
    { href: "/acceptable-use", label: t("acceptableUse"), icon: CheckCircle2 },
    { href: "/cookies", label: t("cookies"), icon: Cookie },
  ];

  return (
    <nav className="flex items-center gap-2 overflow-x-auto border-b border-border pb-4 mb-8 text-sm">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap",
              isActive
                ? "bg-accent/10 text-accent font-semibold"
                : "text-fg-muted hover:text-fg hover:bg-surface-2"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
