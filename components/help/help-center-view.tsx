"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Search,
  BookOpen,
  Clock,
  ChevronRight,
  MessageSquare,
  ArrowRight,
  Tag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  HelpArticleMeta,
  HELP_CATEGORY_KEYS,
  matchesQuery,
} from "@/lib/help/shared";

interface HelpCenterViewProps {
  articles: HelpArticleMeta[];
  categories?: readonly string[];
}

export function HelpCenterView({
  articles,
  categories = HELP_CATEGORY_KEYS,
}: HelpCenterViewProps) {
  const t = useTranslations("Help");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(
    null
  );

  const filteredArticles = React.useMemo(() => {
    let list = articles;

    if (selectedCategory) {
      list = list.filter((a) => a.categoryKey === selectedCategory);
    }

    if (searchQuery.trim()) {
      list = list.filter((a) =>
        matchesQuery(a, searchQuery, t(`categories.${a.categoryKey}`))
      );
    }

    return list;
  }, [articles, selectedCategory, searchQuery, t]);

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-5xl space-y-12 px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <div className="bg-accent/10 text-accent inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{t("title")}</span>
          </div>
          <h1 className="text-fg text-3xl font-extrabold tracking-tight sm:text-5xl">
            {t("title")}
          </h1>
          <p className="text-fg-muted text-base leading-relaxed sm:text-lg">
            {t("subtitle")}
          </p>

          {/* Search Bar */}
          <div className="relative mx-auto max-w-xl pt-4">
            <Search className="text-fg-subtle absolute top-1/2 left-4 h-5 w-5" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="bg-surface border-border focus-visible:ring-accent h-13 rounded-2xl pr-4 pl-12 text-base shadow-sm"
            />
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center justify-start gap-2 overflow-x-auto pb-2 sm:justify-center">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
            className="rounded-full text-xs"
          >
            {t("allCategories")}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="rounded-full text-xs whitespace-nowrap"
            >
              {t(`categories.${cat}`)}
            </Button>
          ))}
        </div>

        {/* Articles Count / Header */}
        <div className="text-fg-subtle border-border flex items-center justify-between border-b pb-3 text-xs">
          <span>{t("articlesFound", { count: filteredArticles.length })}</span>
          {selectedCategory && (
            <span className="text-accent font-medium">
              {t("filteredBy", {
                category: t(`categories.${selectedCategory}`),
              })}
            </span>
          )}
        </div>

        {/* Articles Grid */}
        {filteredArticles.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredArticles.map((article) => (
              <Link
                key={article.slug}
                href={`/help/${article.slug}`}
                className="group border-border/70 bg-surface hover:border-accent/50 flex flex-col justify-between space-y-4 rounded-2xl border p-6 transition-all hover:shadow-md"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="bg-surface-2 text-fg-muted inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium">
                      <Tag className="text-accent h-3 w-3" />
                      {t(`categories.${article.categoryKey}`)}
                    </span>
                    <span className="text-fg-subtle flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("readMinutes", { count: article.readMinutes })}
                    </span>
                  </div>
                  <h3 className="text-fg group-hover:text-accent flex items-center justify-between text-base font-bold transition-colors">
                    <span>{article.title}</span>
                    <ChevronRight className="text-fg-subtle group-hover:text-accent h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </h3>
                  <p className="text-fg-muted line-clamp-2 text-xs leading-relaxed">
                    {article.description}
                  </p>
                </div>

                <div className="text-accent flex items-center gap-1 pt-1 text-xs font-semibold">
                  <span>{t("readGuide")}</span>
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border-border bg-surface-2/30 space-y-3 rounded-2xl border border-dashed py-12 text-center">
            <BookOpen className="text-fg-subtle mx-auto h-8 w-8" />
            <h3 className="text-fg text-base font-semibold">
              {t("noResultsTitle")}
            </h3>
            <p className="text-fg-muted mx-auto max-w-sm text-xs">
              {t("noResultsDesc")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory(null);
              }}
            >
              {t("resetFilters")}
            </Button>
          </div>
        )}

        {/* Need More Help Banner */}
        <div className="border-border/80 from-accent/10 via-surface to-accent/5 flex flex-col items-center justify-between gap-6 rounded-3xl border bg-linear-to-r p-8 shadow-sm sm:flex-row">
          <div className="space-y-2 text-center sm:text-left">
            <div className="text-accent flex items-center justify-center gap-2 text-sm font-semibold sm:justify-start">
              <MessageSquare className="h-4 w-4" />
              <span>{t("needMoreHelp")}</span>
            </div>
            <h3 className="text-fg text-xl font-bold">{t("needMoreHelp")}</h3>
            <p className="text-fg-muted max-w-lg text-xs sm:text-sm">
              {t("needMoreHelpDesc")}
            </p>
          </div>
          <Button asChild className="shrink-0 rounded-xl px-6">
            <Link href="/support" className="flex items-center gap-2">
              <span>{t("contactSupport")}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
