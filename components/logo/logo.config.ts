import clsx from "clsx";

export const sizeClass = (size: string) =>
  clsx({
    "w-4": size === "text",
    "w-8": size === "small",
    "w-10": size === "icon",
    "w-20": size === "normal",
    "w-32": size === "medium",
    "w-72": size === "large",
  });
