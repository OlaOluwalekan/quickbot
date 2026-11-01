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
    "bg-accent text-accent-fg border border-transparent shadow-sm hover:bg-accent-hover":
      theme === "primary",
    "border border-border-strong bg-transparent text-fg hover:bg-surface-2":
      theme === "outline",
    "border border-border bg-surface text-fg hover:bg-surface-2":
      theme === "base",
  });
