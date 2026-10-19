import { ReactNode } from "react";

export interface AuthCardProps {
  children: ReactNode;
  page: string;
  headerText: string;
  backText: string;
  backLink: "register" | "login";
}
