"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  /**
   * When provided, requires the user to type this exact phrase before the confirm button is enabled.
   */
  confirmText?: string;
  confirmPlaceholder?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  confirmText,
  confirmPlaceholder,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState("");
  const inputId = React.useId();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTyped("");
    }
    onOpenChange(nextOpen);
  };

  const isMatch = confirmText ? typed === confirmText : true;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch || loading) return;
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted">{description}</div>
            </DialogDescription>
          </DialogHeader>

          {confirmText && (
            <div className="space-y-2 pt-1">
              <Label htmlFor={inputId} className="text-xs text-muted">
                Type{" "}
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-fg">
                  {confirmText}
                </span>{" "}
                to confirm:
              </Label>
              <Input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmPlaceholder ?? confirmText}
                autoComplete="off"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={!isMatch || loading}
            >
              {loading && <Spinner size="sm" className="mr-1" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
