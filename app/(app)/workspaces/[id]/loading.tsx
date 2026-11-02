import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="flex-1 flex flex-col h-full w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-fade-in overflow-hidden">
      {/* Top Header skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>

      {/* Conversation timeline skeleton */}
      <div className="flex-1 space-y-6 overflow-hidden">
        {/* User Prompt skeleton (right-aligned) */}
        <div className="flex justify-end">
          <div className="max-w-md w-full rounded-2xl bg-surface-2 p-4 space-y-2 border border-border/40">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        </div>

        {/* Assistant Response skeleton */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3 shadow-xs">
            {/* Thinking skeleton */}
            <Skeleton className="h-7 w-36 rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        </div>
      </div>

      {/* Bottom Composer skeleton */}
      <div className="pt-2">
        <Skeleton className="h-16 w-full rounded-2xl sm:rounded-3xl border border-border/60" />
      </div>
    </div>
  );
}
