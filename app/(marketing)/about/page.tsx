import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo/metadata";
import { AboutView } from "@/components/marketing/about-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Marketing.aboutPage");
  return publicPageMetadata({
    path: "/about",
    title: t("heading"),
    description: t("subheading"),
  });
}

export default function AboutPage() {
  return <AboutView />;
}
