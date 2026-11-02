import * as React from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { getArticles, toMeta } from "@/lib/help/articles";
import { HelpCenterView } from "@/components/help/help-center-view";

export async function generateMetadata() {
  const t = await getTranslations("Help");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function HelpPage() {
  const locale = await getLocale();
  const articles = getArticles(locale);
  const metaArticles = articles.map(toMeta);

  return <HelpCenterView articles={metaArticles} />;
}
