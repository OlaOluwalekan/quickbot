import { BasicBtnProps } from "@/types";
import clsx from "clsx";
import { sizeClass, themeClass } from "./button.config";

const BasicButton = ({ type, text, size, disabled, theme }: BasicBtnProps) => {
  return (
    <button
      type={type}
      className={clsx(
        sizeClass(size),
        themeClass(theme as "base" | "primary" | "outline"),
        disabled && "cursor-not-allowed opacity-50",
        "btn py-2 rounded"
      )}
    >
      {text}
    </button>
  );
};

export default BasicButton;
