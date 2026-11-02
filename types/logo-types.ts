export type LogoSize = "icon" | "text" | "small" | "normal" | "medium" | "large";

export interface LogoProps {
  size?: LogoSize;
  collapsed?: boolean;
  className?: string;
  markClassName?: string;
}
