"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Mail, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RESEND_SECONDS = 15;

const Registered = ({
  accountId: email,
}: {
  accountId: string | null;
}): React.JSX.Element | null => {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [userEmail, setUserEmail] = useState(email || "");
  const [sendingEmail, startSendingEmail] = useTransition();
  const [response, setResponse] = useState<{
    message: string;
    success: boolean;
  }>({
    message: "",
    success: false,
  });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!email) {
      router.push("/auth/register");
    } else {
      setUserEmail(email);
    }
  }, [email, router]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (count > 0) {
      interval = setInterval(() => {
        setCount((c) => c - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [count]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetEmail = (userEmail || email || "").trim();
    if (!targetEmail) return;
    setResponse({ message: "", success: false });

    startSendingEmail(async () => {
      try {
        await authClient.sendVerificationEmail({
          email: targetEmail,
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });
        setResponse({
          message: "If the account exists, a verification email was sent.",
          success: true,
        });
        setCount(RESEND_SECONDS);
      } catch (err: unknown) {
        setResponse({
          message:
            err instanceof Error
              ? err.message
              : "Failed to send verification email",
          success: false,
        });
      }
    });
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent-soft border border-border text-accent flex items-center justify-center text-2xl mx-auto mb-4">
        <MailCheck className="h-6 w-6" strokeWidth={1.5} />
      </div>

      <h1 className="text-2xl font-extrabold text-fg mb-2">
        {t("registeredTitle")}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate>
        {email ? (
          <p className="text-xs sm:text-sm text-muted leading-relaxed">
            {t("registeredDescription")}
          </p>
        ) : (
          <div
            role="alert"
            className="flex items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>No account email provided. Redirecting...</span>
          </div>
        )}

        <div className="relative flex items-center">
          <Mail
            className="pointer-events-none absolute left-3 h-4 w-4 text-subtle"
            strokeWidth={1.5}
          />
          <Input
            type="email"
            placeholder={t("emailPlaceholder")}
            name="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            readOnly
            className="bg-surface-2 pl-9 text-muted"
          />
        </div>

        {response.message && (
          <div
            role="alert"
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium sm:text-sm",
              response.success
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            )}
          >
            {response.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            )}
            <span>{response.message}</span>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={sendingEmail || count > 0 || !userEmail}
        >
          {sendingEmail
            ? tCommon("loading")
            : count > 0
            ? `${t("resendEmailLink")} (${count}s)`
            : t("resendEmailLink")}
        </Button>
      </form>
    </div>
  );
};

export default Registered;
