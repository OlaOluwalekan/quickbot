"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { PLANS } from "@/server/billing/plans";
import type { GateReason } from "@/lib/entitlements/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface GatedProps {
  reason: GateReason | null | undefined;
  children: React.ReactElement;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

type GateTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

function gateMessage(reason: GateReason, t: GateTranslator): string {
  switch (reason.code) {
    case "requires_plan":
      return t("requires_plan", {
        plan: PLANS[reason.plan]?.name ?? reason.plan,
      });
    case "member_limit":
      return t("member_limit", { limit: reason.limit });
    case "daily_cap":
      return t("daily_cap");
    case "no_permission":
      return t("no_permission", { capability: reason.capability });
    case "max_depth":
      return t("max_depth", { depth: reason.depth });
  }
}

// Short delay before closing so the pointer can travel from the trigger
// into the tooltip (e.g. to click the Upgrade link).
const CLOSE_DELAY_MS = 150;

export function Gated({
  reason,
  children,
  className,
  side = "top",
}: GatedProps) {
  const t = useTranslations("Gates");
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const show = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  if (!reason) {
    return children;
  }

  const message = gateMessage(reason, t as GateTranslator);
  const upgradeLabel = t("upgrade");
  const childProps = (children.props ?? {}) as Record<string, unknown>;

  const gatedChild = React.cloneElement(
    children as React.ReactElement<Record<string, unknown>>,
    {
      "aria-disabled": "true",
      "data-disabled": "",
      onClick: undefined,
      tabIndex: -1,
      className: cn(
        typeof childProps.className === "string"
          ? childProps.className
          : undefined,
        "opacity-50 cursor-not-allowed"
      ),
    }
  );

  const ariaLabel =
    reason.code === "requires_plan"
      ? `${message} · ${upgradeLabel}`
      : `${message}\u200B`;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-gated={reason.code}
          className={cn("inline-flex cursor-not-allowed", className)}
          onFocus={show}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setOpen(false);
            }
          }}
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {gatedChild}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        aria-label={ariaLabel}
        className="flex items-center gap-2"
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
      >
        <span>{message}</span>
        {reason.code === "requires_plan" && (
          <Link
            href="/pricing"
            className="font-semibold text-accent underline underline-offset-2 hover:opacity-80"
          >
            {upgradeLabel}
          </Link>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export default Gated;
