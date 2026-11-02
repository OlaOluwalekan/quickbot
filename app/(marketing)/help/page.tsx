import * as React from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getArticles, toMeta } from "@/lib/help/articles";
import { HelpCenterView } from "@/components/help/help-center-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Help");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: "/help",
    },
    openGraph: {
      title: `${t("metaTitle")} · Klecx`,
      description: t("metaDescription"),
      url: "/help",
    },
  };
}

export default async function HelpPage() {
  const locale = await getLocale();
  const articles = getArticles(locale);
  const metaArticles = articles.map(toMeta);

  return <HelpCenterView articles={metaArticles} />;
}
