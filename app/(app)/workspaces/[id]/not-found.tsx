import * as React from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderX, Layers, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function WorkspaceNotFound() {
  const t = await getTranslations("Errors");

  return (
    <div className="flex-1 w-full h-full min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={<FolderX className="h-6 w-6 text-accent" />}
          title={t("workspaceNotFound.title")}
          description={t("workspaceNotFound.description")}
          className="border-border/80 bg-surface/80 p-8 sm:p-10 shadow-xs"
          action={
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              <Button
                asChild
                size="sm"
                className="rounded-xl inline-flex items-center gap-2"
              >
                <Link href="/workspaces">
                  <Layers className="h-3.5 w-3.5" />
                  <span>{t("workspaceNotFound.backButton")}</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-xl inline-flex items-center gap-2"
              >
                <Link href="/">
                  <Home className="h-3.5 w-3.5 text-accent" />
                  <span>{t("workspaceNotFound.homeButton")}</span>
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
