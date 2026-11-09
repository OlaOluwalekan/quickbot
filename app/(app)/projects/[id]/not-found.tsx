import Link from "next/link";
import { FolderX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 min-h-[60vh]">
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center max-w-md w-full">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <FolderX className="h-6 w-6" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-fg">Project not found</h2>
        <p className="mt-1.5 text-sm text-fg-muted max-w-sm">
          This project doesn&apos;t exist, has been deleted, or you don&apos;t have permission to view it.
        </p>
        <div className="mt-6">
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link href="/workspaces">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to workspaces</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
