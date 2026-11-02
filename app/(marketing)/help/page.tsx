import * as React from "react";
import { getAllArticles, getCategories } from "@/lib/help/articles";
import { HelpCenterView } from "@/components/help/help-center-view";

export const metadata = {
  title: "Help Center & Documentation · Klecx",
  description: "Searchable guides, documentation, and tutorials for using Klecx workspaces and AI models.",
};

export default function HelpPage() {
  const articles = getAllArticles();
  const categories = getCategories();

  return <HelpCenterView articles={articles} categories={categories} />;
}
