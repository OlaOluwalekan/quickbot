import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Clock, Tag, MessageSquare, Info } from "lucide-react";
import { getArticle } from "@/lib/help/articles";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

interface HelpArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HelpArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const article = getArticle(locale, slug);
  const t = await getTranslations("Help");

  if (!article) return { title: t("articleNotFoundTitle") };

  const pageTitle = `${article.title} ${t("articleTitleSuffix")}`;
  return {
    title: pageTitle,
    description: article.description,
    alternates: {
      canonical: `/help/${slug}`,
    },
    openGraph: {
      title: `${pageTitle} · Klecx`,
      description: article.description,
      url: `/help/${slug}`,
    },
  };
}

export default async function HelpArticlePage({ params }: HelpArticlePageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const article = getArticle(locale, slug);

  if (!article) {
    notFound();
  }

  const t = await getTranslations("Help");

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Navigation & Breadcrumbs */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <Link
            href="/help"
            className="inline-flex items-center gap-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t("backToHelp")}</span>
          </Link>

          <div className="flex items-center gap-3 text-xs text-fg-subtle">
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">
              <Tag className="h-3 w-3 text-accent" />
              {t(`categories.${article.categoryKey}`)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("readMinutes", { count: article.readMinutes })}
            </span>
          </div>
        </div>

        {/* Fallback translation notice */}
        {article.isFallback && (
          <div
            role="note"
            className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-accent"
          >
            <Info className="h-4 w-4 shrink-0" />
            <span>{t("notTranslated")}</span>
          </div>
        )}

        {/* Article Header */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
            {article.title}
          </h1>
          <p className="text-base text-fg-muted leading-relaxed">
            {article.description}
          </p>
        </div>

        {/* Article Body */}
        <div
          lang={article.isFallback ? "en" : undefined}
          className="rounded-2xl border border-border/70 bg-surface p-6 sm:p-10 shadow-2xs"
        >
          <Markdown content={article.content} />
        </div>

        {/* Footer Support CTA */}
        <div className="rounded-2xl border border-border/80 bg-surface-2/40 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-sm font-bold text-fg">{t("helpfulQuestion")}</h4>
            <p className="text-xs text-fg-muted">{t("helpfulDesc")}</p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/support" className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{t("contactSupport")}</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
