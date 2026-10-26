import clsx from "clsx";

export const sizeClass = (size: string) =>
  clsx({
    "px-3.5 min-w-[96px]": size === "small",
    "px-5 min-w-[140px]": size === "medium",
    "px-7 min-w-[220px]": size === "large",
    "w-full px-4": size === "full",
  });

export const themeClass = (theme: "primary" | "outline" | "base") =>
  clsx({
    "bg-gradient-to-r from-indigo-600 to-sky-500 text-white border border-transparent shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30":
      theme === "primary",
    "border border-slate-300 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800":
      theme === "outline",
    "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800":
      theme === "base",
  });
