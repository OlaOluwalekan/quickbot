"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, CheckCircle2, AlertCircle, ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function calculateStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "bg-border" };

  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 14) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { score: 1, label: "Weak (minimum 10 characters required)", color: "bg-danger" };
  if (score <= 3) return { score: 2, label: "Medium", color: "bg-warning" };
  return { score: 3, label: "Strong password", color: "bg-success" };
}

export function ResetPasswordForm() {
  const t = useTranslations("Auth");
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const strength = React.useMemo(() => calculateStrength(password), [password]);

  if (!token) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-fg space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">
            {t("invalidTokenTitle")}
          </h2>
          <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
            {t("invalidTokenDesc")}
          </p>
        </div>

        <div className="pt-2">
          <Button asChild className="w-full rounded-xl text-xs">
            <Link href="/auth/forgot-password">
              {t("requestNewLink")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);

    try {
      const { error: resetErr } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (resetErr) {
        setError(resetErr.message || "Failed to reset password. Link may have expired.");
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-fg space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-fg">
            {t("resetSuccessTitle")}
          </h2>
          <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
            {t("resetSuccessDesc")}
          </p>
        </div>

        <div className="pt-2">
          <Button asChild className="w-full rounded-xl text-xs">
            <Link href="/auth/login">
              {t("goToSignIn") || "Sign in with new password"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-fg space-y-6">
      <div className="text-center space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {t("resetPasswordTitle")}
        </h1>
        <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
          {t("resetPasswordSubtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-xs text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* New Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg">
            {t("newPasswordLabel")}
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
            <Input
              type={showPassword ? "text" : "password"}
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="h-11 pl-10 pr-10 bg-surface-2/40 border-border text-xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Strength Meter */}
          {password && (
            <div className="space-y-1.5 pt-1">
              <div className="flex h-1.5 w-full gap-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full transition-all duration-300 ${strength.color}`}
                  style={{ width: `${(strength.score / 3) * 100}%` }}
                />
              </div>
              <p className="text-[11px] text-fg-subtle flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-accent" />
                <span>{strength.label}</span>
              </p>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg">
            {t("confirmPasswordLabel")}
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
            <Input
              type={showPassword ? "text" : "password"}
              required
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="h-11 pl-10 bg-surface-2/40 border-border text-xs"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || password.length < 10}
          className="w-full h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        >
          <Lock className="h-3.5 w-3.5" />
          <span>{loading ? t("resettingPassword") : t("resetPasswordButton")}</span>
        </Button>
      </form>
    </div>
  );
}
