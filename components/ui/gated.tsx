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

function formatGateReasonMessage(
  reason: GateReason,
  t: (key: string, values?: Record<string, string | number>) => string
): { message: string; upgradeLabel: string } {
  const translateWithFallback = (
    key: string,
    values: Record<string, string | number> | undefined,
    fallback: string
  ): string => {
    try {
      const res = t(key, values);
      if (!res || res === key || res === `Gates.${key}`) {
        return fallback;
      }
      return res;
    } catch {
      return fallback;
    }
  };

  const upgradeLabel = translateWithFallback("upgrade", undefined, "Upgrade");

  switch (reason.code) {
    case "requires_plan": {
      const planName = PLANS[reason.plan]?.name ?? reason.plan;
      return {
        message: translateWithFallback(
          "requires_plan",
          { plan: planName },
          `Available on the ${planName} plan and above`
        ),
        upgradeLabel,
      };
    }
    case "member_limit":
      return {
        message: translateWithFallback(
          "member_limit",
          { limit: reason.limit },
          `Your plan allows up to ${reason.limit} collaborators`
        ),
        upgradeLabel,
      };
    case "daily_cap":
      return {
        message: translateWithFallback(
          "daily_cap",
          undefined,
          "You have reached your daily limit for this feature"
        ),
        upgradeLabel,
      };
    case "no_permission":
      return {
        message: translateWithFallback(
          "no_permission",
          { capability: reason.capability },
          `You don't have permission to ${reason.capability}`
        ),
        upgradeLabel,
      };
    case "max_depth":
      return {
        message: translateWithFallback(
          "max_depth",
          { depth: reason.depth },
          `Maximum thread depth (${reason.depth}) reached. Promote this answer to a new workspace to continue.`
        ),
        upgradeLabel,
      };
  }
}

export function Gated({
  reason,
  children,
  className,
  side = "top",
}: GatedProps) {
  const t = useTranslations("Gates");
  const [open, setOpen] = React.useState(false);

  if (!reason) {
    return children;
  }

  const { message, upgradeLabel } = formatGateReasonMessage(reason, t);
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
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setOpen(false);
            }
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
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
