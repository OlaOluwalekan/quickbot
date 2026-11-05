"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { validateUsernameFormat, normalizeUsername } from "@/lib/username";

interface ClaimUsernameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUsername?: string | null;
  onSuccess?: (newUsername: string) => void;
}

export function ClaimUsernameDialog({
  open,
  onOpenChange,
  currentUsername,
  onSuccess,
}: ClaimUsernameDialogProps) {
  const [value, setValue] = React.useState("");
  const [debouncedValue, setDebouncedValue] = React.useState("");
  const [isChecking, setIsChecking] = React.useState(false);
  const [isAvailable, setIsAvailable] = React.useState<boolean | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [confirmStep, setConfirmStep] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Debounce input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  // Validate and check availability
  React.useEffect(() => {
    if (!debouncedValue) {
      setIsAvailable(null);
      setValidationError(null);
      setIsChecking(false);
      return;
    }

    const valResult = validateUsernameFormat(debouncedValue);
    if (!valResult.valid) {
      setValidationError(valResult.reason);
      setIsAvailable(false);
      setIsChecking(false);
      return;
    }

    setValidationError(null);

    // If it's already the current user's username
    if (currentUsername && normalizeUsername(debouncedValue) === normalizeUsername(currentUsername)) {
      setIsAvailable(true);
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    fetch(`/api/v1/usernames/check?u=${encodeURIComponent(valResult.normalized)}`)
      .then((res) => res.json())
      .then((body: { data?: { available?: boolean }; available?: boolean }) => {
        if (!cancelled) {
          const avail = body.data?.available ?? body.available ?? false;
          setIsAvailable(avail);
          setIsChecking(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAvailable(null);
          setIsChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedValue, currentUsername]);

  const handleClaim = async () => {
    if (!debouncedValue || !isAvailable) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/v1/me/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: debouncedValue }),
      });

      const body = await res.json().catch(() => ({}));
      const payload = body.data || body;

      if (!res.ok) {
        const err = body.error || body;
        if (res.status === 409) {
          if (err.code === "username_already_changed") {
            setSubmitError("Username can only be changed once. You have already claimed a username.");
          } else {
            setSubmitError(err.message || "This username was just claimed by someone else.");
          }
        } else {
          setSubmitError(err.message || "Failed to claim username. Please try again.");
        }
        setIsSubmitting(false);
        return;
      }

      onSuccess?.(payload.username || debouncedValue);
      onOpenChange(false);
    } catch {
      setSubmitError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setValue("");
    setDebouncedValue("");
    setIsChecking(false);
    setIsAvailable(null);
    setValidationError(null);
    setConfirmStep(false);
    setIsSubmitting(false);
    setSubmitError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetState();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirmStep ? "Confirm your username" : "Choose your username"}
          </DialogTitle>
          <DialogDescription>
            {confirmStep
              ? "This cannot be changed again. Please confirm your choice."
              : "Every account has a unique username. You can customize yours exactly once."}
          </DialogDescription>
        </DialogHeader>

        {submitError && (
          <div className="flex items-center gap-2 p-3 text-sm rounded-lg border border-danger/30 bg-danger/10 text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {!confirmStep ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label
                htmlFor="username-input"
                className="text-xs font-medium text-subtle"
              >
                Username
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle font-mono text-sm">
                  @
                </span>
                <Input
                  id="username-input"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                    setSubmitError(null);
                  }}
                  placeholder="yourname"
                  className="pl-8 pr-10 font-mono text-sm"
                  maxLength={30}
                  autoFocus
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isChecking && (
                    <Loader2 className="h-4 w-4 animate-spin text-subtle" />
                  )}
                  {!isChecking && isAvailable === true && (
                    <Check className="h-4 w-4 text-success" />
                  )}
                  {!isChecking && (isAvailable === false || validationError) && (
                    <AlertCircle className="h-4 w-4 text-danger" />
                  )}
                </div>
              </div>

              {validationError && (
                <p className="text-xs text-danger">{validationError}</p>
              )}
              {!validationError && !isChecking && isAvailable === false && (
                <p className="text-xs text-danger">Username is already taken or unavailable.</p>
              )}
              {!validationError && !isChecking && isAvailable === true && (
                <p className="text-xs text-success">Username is available!</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs text-subtle mb-1">Preview:</p>
              <p className="font-mono text-sm text-fg font-medium">
                @{value.trim() || currentUsername || "username"}
              </p>
            </div>

            <p className="text-xs text-subtle">
              Rules: 3–30 characters, lowercase letters, numbers, and underscores. Must start with a letter.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-fg">
              <p className="font-semibold text-warning mb-1">Important notice:</p>
              <p className="text-subtle">
                Once set, your username cannot be changed through the app. You are claiming:
              </p>
              <p className="mt-2 text-base font-mono font-bold text-fg">
                @{debouncedValue}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {!confirmStep ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Later
              </Button>
              <Button
                onClick={() => setConfirmStep(true)}
                disabled={!debouncedValue || isAvailable !== true || isChecking}
                className="gap-1.5"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmStep(false)}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                onClick={handleClaim}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm & Claim
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
