import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "New Chat | Ask Quick anything",
  description:
    "Get real time responses to your questions, needs, and concerns.",
};

const layout = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

export default layout;
