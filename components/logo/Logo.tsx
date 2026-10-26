"use client";

import { LogoProps } from "@/types/logo-types";
import clsx from "clsx";
import { sizeClass } from "./logo.config";

/**
 * Klecx brand logo mark
 * @param {Object} props - component properties
 * @param {string} props.size - size of the logo - icon, text, small, normal, medium or large
 * @returns {JSX.Element} styled logo component
 */
const Logo = ({ size }: LogoProps): React.JSX.Element => {
  return (
    <div
      className={clsx(
        "inline-flex aspect-square shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 via-purple-600 to-cyan-500 p-1.5 shadow-md shadow-indigo-500/20",
        sizeClass(size)
      )}
      role="img"
      aria-label="Klecx Logo"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full text-white"
      >
        <path
          d="M8 6V26M8 16L20 6M13.5 11.5L22 26"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="8" r="2.5" fill="#22D3EE" />
      </svg>
    </div>
  );
};

export default Logo;
