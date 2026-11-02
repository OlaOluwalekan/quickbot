"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps
  extends Omit<ButtonProps, "onClick" | "children"> {
  value: string;
  label?: string;
  copiedLabel?: string;
  showText?: boolean;
}

export function CopyButton({
  value,
  label = "Copy to clipboard",
  copiedLabel = "Copied",
  showText = false,
  variant = "ghost",
  size = "icon",
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write may fail in non-secure contexts
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={showText ? "sm" : size}
      aria-label={copied ? copiedLabel : label}
      tooltip={copied ? copiedLabel : label}
      onClick={handleCopy}
      className={cn(copied && "text-success", className)}
      {...props}
    >
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={1.5} />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={1.5} />
      )}
      {showText && <span>{copied ? copiedLabel : label}</span>}
    </Button>
  );
}
