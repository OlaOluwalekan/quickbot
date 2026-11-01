import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "flex min-h-10 max-sm:min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg placeholder:text-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
