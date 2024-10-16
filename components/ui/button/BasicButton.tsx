import { BasicBtnProps } from "@/types";
import clsx from "clsx";
import { sizeClass, themeClass } from "./button.config";

/**
 * Basic button
 * @param {Object} props - component properties
 * @param {string} props.type - button type either submit, button or reset
 * @param {string} props.text - text of the button
 * @param {string} props.size - button size either small, medium, large or full
 * @param {boolean} props.disabled - whether the button is disabled or not
 * @param {string} props.theme - the button theme either primary, outline or base
 * @param {string} props.title - the title of the button for tool tip
 * @returns {JSX.Element} styled button component
 */
const BasicButton = ({
  type,
  text,
  size,
  disabled,
  theme,
  title,
}: BasicBtnProps): JSX.Element => {
  return (
    <button
      type={type}
      className={clsx(
        sizeClass(size),
        themeClass(theme as "base" | "primary" | "outline"),
        disabled && "cursor-not-allowed opacity-50",
        "btn py-2 rounded"
      )}
      title={title}
    >
      {text}
    </button>
  );
};

export default BasicButton;
