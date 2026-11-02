"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Mail, CheckCircle2, AlertCircle, ArrowLeft, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: cleanEmail,
        redirectTo: "/auth/reset-password",
      });

      if (authError) {
        // Even on error, if it's rate limit show rate limit, otherwise generic confirmation to prevent user enumeration
        if (authError.status === 429) {
          setError("Too many password reset requests. Please wait an hour before trying again.");
          return;
        }
      }

      setSubmittedEmail(cleanEmail);
    } catch {
      // Show generic confirmation to prevent email enumeration
      setSubmittedEmail(cleanEmail);
    } finally {
      setLoading(false);
    }
  };

  if (submittedEmail) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-fg space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-fg">
            {t("resetLinkSentTitle")}
          </h2>
          <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
            {t("resetLinkSentDesc", { email: submittedEmail })}
          </p>
        </div>

        <div className="pt-2">
          <Button asChild variant="outline" className="w-full rounded-xl text-xs">
            <Link href="/auth/login" className="flex items-center justify-center gap-2">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t("backToSignIn")}</span>
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
          {t("forgotPasswordTitle")}
        </h1>
        <p className="text-xs sm:text-sm text-fg-muted leading-relaxed">
          {t("forgotPasswordSubtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-xs text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-11 pl-10 bg-surface-2/40 border-border text-xs"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{loading ? t("sendingResetLink") : t("sendResetLink")}</span>
        </Button>
      </form>

      <div className="text-center pt-2 text-xs text-fg-muted">
        <span>{t("rememberPassword")} </span>
        <Link href="/auth/login" className="font-semibold text-accent hover:underline">
          {t("signInLink")}
        </Link>
      </div>
    </div>
  );
}
