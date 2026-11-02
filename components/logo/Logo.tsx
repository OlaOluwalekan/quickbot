"use client";

import * as React from "react";
import clsx from "clsx";
import type { LogoProps } from "@/types/logo-types";
import { sizeClass, iconSizeClass, maxTextWidthClass } from "./logo.config";

/**
 * Klecx brand logo mark & responsive wordmark
 *
 * Expands to full wordmark "Kl [e] cx" when space permits,
 * smoothly collapsing down to just the central styled "e" mark when space is constrained (e.g. collapsed sidebar rail).
 * Uses design system CSS variables (--accent, --fg) to match light and dark themes.
 */
const Logo = ({
  size = "icon",
  collapsed = false,
  className,
  markClassName,
}: LogoProps): React.JSX.Element => {
  return (
    <div
      className={clsx(
        "text-fg inline-flex items-center font-bold tracking-tight transition-all duration-300 ease-in-out select-none",
        sizeClass(size),
        className
      )}
      role="img"
      aria-label="Klecx Logo"
    >
      {/* Prefix "Kl" */}
      <span
        aria-hidden="true"
        className={clsx(
          "inline-block overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out select-none",
          collapsed
            ? "pointer-events-none mr-0 max-w-0 -translate-x-2 opacity-0"
            : clsx(maxTextWidthClass(size), "mr-1 translate-x-0 opacity-100")
        )}
      >
        Kl
      </span>

      {/* Central styled "e" mark */}
      <span
        className={clsx(
          "text-accent inline-flex shrink-0 items-center justify-center transition-transform duration-300 ease-in-out",
          markClassName
        )}
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx(iconSizeClass(size), "transition-all duration-300")}
          aria-hidden="true"
        >
          <path
            d="M 60 36 H 37 V 63.5 H 91.75 V 8.25 H 8.25 V 91.75 H 91.75"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
      </span>

      {/* Suffix "cx" */}
      <span
        aria-hidden="true"
        className={clsx(
          "inline-block overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out select-none",
          collapsed
            ? "pointer-events-none ml-0 max-w-0 translate-x-2 opacity-0"
            : clsx(maxTextWidthClass(size), "ml-1 translate-x-0 opacity-100")
        )}
      >
        cx
      </span>
    </div>
  );
};

export default Logo;
