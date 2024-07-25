import { ReactEventHandler, ReactNode } from "react";

export interface BasicInputProps {
  type: string;
  placeholder?: string;
  readonly?: boolean;
  name?: string;
  id?: string;
  value?: string;
}

export interface InputWithIconsProps extends BasicInputProps {
  icons: ReactNode;
  onChange?: ReactEventHandler<HTMLInputElement>;
}
