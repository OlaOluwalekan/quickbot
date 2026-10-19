import { BasicBtnProps } from "@/types";
import clsx from "clsx";
import { sizeClass, themeClass } from "./button.config";

/**
 * Sleek rebranded BasicButton component that properly forwards `disabled` and `onClick`.
 */
const BasicButton = ({
  type,
  text,
  size,
  disabled,
  theme,
  title,
  onClick,
}: BasicBtnProps): React.JSX.Element => {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={clsx(
        sizeClass(size),
        themeClass(theme as "base" | "primary" | "outline"),
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer opacity-100 hover:opacity-95 active:scale-[0.99]",
        "rounded-xl font-semibold transition-all duration-200 shadow-xs",
        size === "small" ? "py-1.5 text-sm" : "py-2.5 text-sm sm:text-base"
      )}
    >
      {text}
    </button>
  );
};

export default BasicButton;
