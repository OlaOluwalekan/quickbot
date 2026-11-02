"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, BookOpen, Clock, ChevronRight, MessageSquare, ArrowRight, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { HelpArticle } from "@/lib/help/articles";

interface HelpCenterViewProps {
  articles: HelpArticle[];
  categories: string[];
}

export function HelpCenterView({ articles, categories }: HelpCenterViewProps) {
  const t = useTranslations("Help");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const filteredArticles = React.useMemo(() => {
    let list = articles;

    if (selectedCategory) {
      list = list.filter((a) => a.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => {
        return (
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.keywords.some((k) => k.toLowerCase().includes(q)) ||
          a.category.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [articles, selectedCategory, searchQuery]);

  return (
    <div className="py-12 md:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{t("title")}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-fg">
            {t("title")}
          </h1>
          <p className="text-base sm:text-lg text-fg-muted leading-relaxed">
            {t("subtitle")}
          </p>

          {/* Search Bar */}
          <div className="relative pt-4 max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-13 pl-12 pr-4 text-base bg-surface border-border shadow-sm rounded-2xl focus-visible:ring-accent"
            />
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 justify-start sm:justify-center">
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
              {cat}
            </Button>
          ))}
        </div>

        {/* Articles Count / Header */}
        <div className="flex items-center justify-between text-xs text-fg-subtle border-b border-border pb-3">
          <span>{t("articlesFound", { count: filteredArticles.length })}</span>
          {selectedCategory && (
            <span className="font-medium text-accent">Filtered by: {selectedCategory}</span>
          )}
        </div>

        {/* Articles Grid */}
        {filteredArticles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredArticles.map((article) => (
              <Link
                key={article.slug}
                href={`/help/${article.slug}`}
                className="group flex flex-col justify-between p-6 rounded-2xl border border-border/70 bg-surface hover:border-accent/50 hover:shadow-md transition-all space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1 font-medium text-fg-muted">
                      <Tag className="h-3 w-3 text-accent" />
                      {article.category}
                    </span>
                    <span className="flex items-center gap-1 text-fg-subtle">
                      <Clock className="h-3 w-3" />
                      {article.readTime}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-fg group-hover:text-accent transition-colors flex items-center justify-between">
                    <span>{article.title}</span>
                    <ChevronRight className="h-4 w-4 text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </h3>
                  <p className="text-xs text-fg-muted leading-relaxed line-clamp-2">
                    {article.description}
                  </p>
                </div>

                <div className="text-xs font-semibold text-accent flex items-center gap-1 pt-1">
                  <span>Read guide</span>
                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-border rounded-2xl bg-surface-2/30 space-y-3">
            <BookOpen className="h-8 w-8 text-fg-subtle mx-auto" />
            <h3 className="text-base font-semibold text-fg">{t("noResultsTitle")}</h3>
            <p className="text-xs text-fg-muted max-w-sm mx-auto">{t("noResultsDesc")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory(null);
              }}
            >
              Reset filters
            </Button>
          </div>
        )}

        {/* Need More Help Banner */}
        <div className="rounded-3xl border border-border/80 bg-linear-to-r from-accent/10 via-surface to-accent/5 p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="space-y-2 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-accent font-semibold text-sm">
              <MessageSquare className="h-4 w-4" />
              <span>{t("needMoreHelp")}</span>
            </div>
            <h3 className="text-xl font-bold text-fg">{t("needMoreHelp")}</h3>
            <p className="text-xs sm:text-sm text-fg-muted max-w-lg">
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
