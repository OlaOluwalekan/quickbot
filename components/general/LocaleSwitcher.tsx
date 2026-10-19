"use client";

import React, { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Locale, LOCALE_COOKIE, localeNames, locales } from "@/i18n/config";
import { HiOutlineGlobeAlt } from "react-icons/hi2";

interface LocaleSwitcherProps {
  compact?: boolean;
  className?: string;
}

const LocaleSwitcher: React.FC<LocaleSwitcherProps> = ({
  compact = false,
  className = "",
}) => {
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: Locale) => {
    if (newLocale === currentLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-xs transition-all ${
        isPending ? "opacity-60 pointer-events-none" : ""
      } ${className}`}
    >
      <HiOutlineGlobeAlt className="text-base text-indigo-500 shrink-0" />
      <select
        aria-label="Select language"
        value={currentLocale}
        onChange={(e) => handleLocaleChange(e.target.value as Locale)}
        disabled={isPending}
        className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer pr-1"
      >
        {locales.map((loc) => (
          <option
            key={loc}
            value={loc}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          >
            {compact ? loc.toUpperCase() : localeNames[loc]}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LocaleSwitcher;
