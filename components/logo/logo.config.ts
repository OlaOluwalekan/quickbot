import clsx from "clsx";
import type { LogoSize } from "@/types/logo-types";

export const sizeClass = (size: LogoSize = "icon") =>
  clsx({
    "text-sm": size === "text",
    "text-base": size === "small",
    "text-xl": size === "icon",
    "text-2xl": size === "normal",
    "text-3xl": size === "medium",
    "text-5xl": size === "large",
  });

export const iconSizeClass = (size: LogoSize = "icon") =>
  clsx({
    "h-3.5 w-3.5": size === "text",
    "h-4.5 w-4.5": size === "small",
    "h-6 w-6": size === "icon",
    "h-7 w-7": size === "normal",
    "h-9 w-9": size === "medium",
    "h-14 w-14": size === "large",
  });

export const maxTextWidthClass = (size: LogoSize = "icon") =>
  clsx({
    "max-w-7": size === "text",
    "max-w-8": size === "small",
    "max-w-10": size === "icon",
    "max-w-12": size === "normal",
    "max-w-16": size === "medium",
    "max-w-28": size === "large",
  });
