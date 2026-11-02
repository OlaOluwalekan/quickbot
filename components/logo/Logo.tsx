"use client";

import { LogoProps } from "@/types/logo-types";
import clsx from "clsx";
import { sizeClass } from "./logo.config";

/**
 * Klecx brand logo mark
 */
const Logo = ({ size }: LogoProps): React.JSX.Element => {
  return (
    <div
      className={clsx(
        "inline-flex aspect-square shrink-0 items-center justify-center rounded-xl bg-accent p-1.5 shadow-sm text-accent-fg",
        sizeClass(size)
      )}
      role="img"
      aria-label="Klecx Logo"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full text-accent-fg"
      >
        <path
          d="M8 6V26M8 16L20 6M13.5 11.5L22 26"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="8" r="2.5" fill="currentColor" />
      </svg>
    </div>
  );
};

export default Logo;
