import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UiShowcase } from "./ui-showcase";

export const metadata: Metadata = {
  title: "UI Showcase",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <UiShowcase />;
}
