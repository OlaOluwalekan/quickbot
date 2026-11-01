"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 touch-manipulation",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover",
        destructive:
          "bg-danger text-accent-fg shadow-sm hover:opacity-90",
        outline:
          "border border-border-strong bg-surface text-fg shadow-sm hover:bg-surface-2",
        secondary:
          "bg-surface-2 text-fg border border-border hover:bg-surface-3",
        ghost:
          "text-fg hover:bg-surface-2",
        link:
          "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-10 max-sm:min-h-11 px-4 py-2",
        sm: "min-h-10 max-sm:min-h-11 rounded-md px-3 text-xs",
        lg: "min-h-11 rounded-lg px-6 text-base",
        icon: "min-h-10 min-w-10 max-sm:min-h-11 max-sm:min-w-11 p-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  tooltip?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, tooltip, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const resolvedAriaLabel =
      props["aria-label"] ?? (size === "icon" ? tooltip : undefined);

    const buttonElement = (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-label={resolvedAriaLabel}
        {...props}
      />
    );

    if (tooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{buttonElement}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      );
    }

    return buttonElement;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
