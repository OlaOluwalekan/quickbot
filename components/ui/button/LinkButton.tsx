import { LinkBtnProps } from "@/types";
import clsx from "clsx";
import Link from "next/link";
import { sizeClass, themeClass } from "./button.config";

const LinkButton = ({ size, text, theme, href }: LinkBtnProps) => {
  return (
    <Link
      href={href}
      className={clsx(
        sizeClass(size),
        themeClass(theme as "base" | "primary" | "outline"),
        "inline-flex items-center justify-center font-semibold transition-all duration-200 py-2.5 rounded-xl text-sm text-center cursor-pointer hover:opacity-95"
      )}
    >
      {text}
    </Link>
  );
};

export default LinkButton;
