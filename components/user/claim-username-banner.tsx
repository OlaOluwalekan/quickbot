"use client";

import * as React from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClaimUsernameBannerProps {
  claimed: boolean;
  onClaimClick: () => void;
}

export function ClaimUsernameBanner({
  claimed,
  onClaimClick,
}: ClaimUsernameBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (claimed || dismissed) {
    return null;
  }

  return (
    <div
      role="banner"
      className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5 text-xs sm:text-sm text-fg"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">
          <strong className="font-semibold">Choose your username</strong> — you can change it only once.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={onClaimClick}
          className="h-7 text-xs font-medium"
        >
          Claim username
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-1 text-subtle hover:text-fg hover:bg-surface cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
