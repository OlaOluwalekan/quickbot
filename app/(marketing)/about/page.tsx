import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AboutView } from "@/components/marketing/about-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.aboutPage");
  return {
    title: "About Klecx — Independent AI Workspace",
    description: t("subheading"),
    alternates: {
      canonical: "/about",
    },
    openGraph: {
      title: "About Klecx — Independent AI Workspace",
      description: t("subheading"),
      url: "/about",
    },
  };
}

export default function AboutPage() {
  return <AboutView />;
}
