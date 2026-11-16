"use client";

import { useFormatter, useTranslations } from "next-intl";

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * "Today", "Yesterday", "3 days ago", "March 5", "January 10, 2023" in the
 * person's language (replaces the English-only `formatCustomDate`).
 */
export function useActivityDate() {
  const t = useTranslations("Common");
  const format = useFormatter();

  return (value: string | Date, now: Date = new Date()): string => {
    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return "";
    const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
    if (days <= 0) return t("today");
    if (days === 1) return t("yesterday");
    if (days < 7) return format.relativeTime(date, now);
    if (date.getFullYear() === now.getFullYear()) {
      return format.dateTime(date, { month: "long", day: "numeric" });
    }
    return format.dateTime(date, { month: "long", day: "numeric", year: "numeric" });
  };
}
