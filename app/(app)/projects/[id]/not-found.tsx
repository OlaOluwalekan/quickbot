import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ProjectNotFound() {
  const t = await getTranslations("Project");

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <FolderX className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-fg">{t("notFoundTitle")}</h2>
        <p className="mt-1.5 max-w-sm text-sm text-fg-muted">
          {t("notFoundDescription")}
        </p>
        <div className="mt-6">
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/workspaces">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t("backToWorkspaces")}</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
