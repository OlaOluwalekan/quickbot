import { ReactNode } from "react";

export interface AuthCardProps {
  children: ReactNode;
  page: "Register" | "Login";
  headerText: string;
  backText: string;
  backLink: "register" | "login";
}
