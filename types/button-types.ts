import { MouseEvent } from "react";

interface ButtonBase {
  type?: "submit" | "button" | "reset";
  text?: string;
  theme?: "primary" | "outline" | "base";
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}

export interface BasicBtnProps extends ButtonBase {
  size: "small" | "medium" | "large" | "full";
}

export interface LinkBtnProps extends BasicBtnProps {
  href: string;
}

export interface OAuthBtnProps extends ButtonBase {
  icon: JSX.Element;
}
