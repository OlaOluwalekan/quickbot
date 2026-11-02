"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail, Clock, ShieldCheck, CheckCircle2, AlertCircle, Send, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { authClient } from "@/lib/auth-client";

export function SupportForm() {
  const t = useTranslations("Support");
  const { data: session } = authClient.useSession();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [topic, setTopic] = React.useState("general");
  const [message, setMessage] = React.useState("");
  const [attachDiagnostics, setAttachDiagnostics] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState(""); // invisible bot trap

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ticketId, setTicketId] = React.useState<string | null>(null);

  // Prefill name and email when logged in
  React.useEffect(() => {
    if (session?.user) {
      if (session.user.name && !name) setName(session.user.name);
      if (session.user.email && !email) setEmail(session.user.email);
    }
  }, [session, name, email]);

  // Prefill error reference digest if navigated from error page
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const digest = new URLSearchParams(window.location.search).get("digest");
      if (digest) {
        setTopic("bug");
        setMessage((prev) => prev || `Error Reference ID: ${digest}\n\n`);
        setAttachDiagnostics(true);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !message.trim()) {
      setError("Please provide your email address and message.");
      return;
    }

    if (message.trim().length < 10) {
      setError("Message must be at least 10 characters.");
      return;
    }

    setLoading(true);

    try {
      const diagnosticsData = attachDiagnostics
        ? {
            appVersion: "0.1.0",
            clientTimestamp: new Date().toISOString(),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
            language: typeof navigator !== "undefined" ? navigator.language : "unknown",
            screen:
              typeof window !== "undefined"
                ? `${window.innerWidth}x${window.innerHeight}`
                : "unknown",
            hasActiveSession: Boolean(session?.user),
          }
        : undefined;

      const res = await fetch("/api/v1/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim(),
          topic,
          message: message.trim(),
          website: honeypot || undefined,
          diagnostics: diagnosticsData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to submit support request.");
      }

      setTicketId(data.data?.ticketId || "submitted");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTicketId(null);
    setMessage("");
    setError(null);
  };

  if (ticketId) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 sm:p-12 text-center space-y-6 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2 max-w-md mx-auto">
          <h2 className="text-2xl font-bold text-fg">{t("successTitle")}</h2>
          <p className="text-sm text-fg-muted leading-relaxed">
            {t("successMessage")}
          </p>
          <div className="pt-2">
            <span className="inline-block rounded-xl bg-surface-2 border border-border px-4 py-2 font-mono text-xs font-semibold text-accent">
              {t("ticketIdNotice", { ticketId: ticketId.slice(0, 8) })}
            </span>
          </div>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={handleReset} className="rounded-xl text-xs">
            {t("sendAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-surface p-6 sm:p-10 shadow-sm space-y-8">
      <div>
        <h2 className="text-xl font-bold text-fg">{t("formTitle")}</h2>
        <p className="text-xs text-fg-muted mt-1">
          {t("subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-xs text-danger flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Honeypot field (hidden from genuine users) */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website-hp">Website</label>
          <input
            id="website-hp"
            type="text"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-fg">{t("nameLabel")}</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="h-11 bg-surface-2/40 border-border text-xs"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-fg">
              {t("emailLabel")} <span className="text-danger">*</span>
            </label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="h-11 bg-surface-2/40 border-border text-xs"
            />
          </div>
        </div>

        {/* Topic */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-fg">
            {t("topicLabel")} <span className="text-danger">*</span>
          </label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="flex h-11 w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 text-xs text-fg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="general">{t("topics.general")}</option>
            <option value="billing">{t("topics.billing")}</option>
            <option value="account">{t("topics.account")}</option>
            <option value="bug">{t("topics.bug")}</option>
            <option value="feature">{t("topics.feature")}</option>
            <option value="other">{t("topics.other")}</option>
          </select>
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-fg">
              {t("messageLabel")} <span className="text-danger">*</span>
            </label>
            <span className="text-[11px] font-mono text-fg-subtle">
              {message.length} / 5,000
            </span>
          </div>
          <textarea
            required
            rows={6}
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("messagePlaceholder")}
            className="flex w-full rounded-xl border border-border bg-surface-2/40 p-3.5 text-xs text-fg leading-relaxed placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-ring resize-y"
          />
        </div>

        {/* Diagnostics Checkbox */}
        <div className="rounded-xl border border-border/80 bg-surface-2/30 p-4 space-y-2">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="diagnostics-toggle"
              checked={attachDiagnostics}
              onCheckedChange={(c) => setAttachDiagnostics(Boolean(c))}
              className="mt-0.5"
            />
            <label
              htmlFor="diagnostics-toggle"
              className="text-xs font-medium text-fg cursor-pointer select-none leading-relaxed"
            >
              {t("diagnosticsCheckbox")}
            </label>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle pl-6">
            <Info className="h-3 w-3 shrink-0 text-accent" />
            <span>{t("diagnosticsPrivacy")}</span>
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto px-8 h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
        >
          <Send className="h-3.5 w-3.5" />
          <span>{loading ? t("submittingButton") : t("submitButton")}</span>
        </Button>
      </form>
    </div>
  );
}
