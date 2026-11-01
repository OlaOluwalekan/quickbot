"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RESEND_SECONDS = 15;

const VerificationForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [isPending, startTransition] = useTransition();
  const [sendingEmail, startSendingEmail] = useTransition();
  const [response, setResponse] = useState<{
    message: string;
    success: boolean;
  }>({
    message: "",
    success: false,
  });
  const [userEmail, setUserEmail] = useState("");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (count > 0) {
      interval = setInterval(() => {
        setCount((c) => c - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [count]);

  useEffect(() => {
    if (!token) {
      setResponse({
        message: t("verifiedError"),
        success: false,
      });
      return;
    }

    setResponse({ message: "", success: false });
    startTransition(async () => {
      try {
        const { error } = await authClient.verifyEmail({
          query: { token },
        });
        if (error) {
          setResponse({
            message: error.message || t("verifiedError"),
            success: false,
          });
          return;
        }
        setResponse({
          message: "Email verified successfully",
          success: true,
        });
        router.push(DEFAULT_LOGIN_REDIRECT);
        router.refresh();
      } catch {
        setResponse({
          message: t("verifiedError"),
          success: false,
        });
      }
    });
  }, [token, t, router]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userEmail.trim()) return;
    setResponse({ message: "", success: false });

    startSendingEmail(async () => {
      try {
        await authClient.sendVerificationEmail({
          email: userEmail.trim(),
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });
        setResponse({
          message: "If the account exists, a verification email was sent.",
          success: true,
        });
        setCount(RESEND_SECONDS);
      } catch {
        setResponse({
          message: t("verifiedError"),
          success: false,
        });
      }
    });
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-center flex flex-col items-center gap-4">
      <h1 className="text-2xl font-extrabold text-fg">
        {t("verifyingTitle")}
      </h1>

      {isPending && (
        <p className="text-sm text-muted">
          {t("verifyingSubtitle")}
        </p>
      )}

      {!isPending && response.message && (
        <div
          className={clsx(
            "w-full text-sm flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border font-medium",
            response.success
              ? "bg-success/10 border-success/30 text-success"
              : "bg-danger/10 border-danger/30 text-danger"
          )}
        >
          <span>
            {response.success ? (
              <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <XCircle className="h-4 w-4" strokeWidth={1.5} />
            )}
          </span>
          <p>{response.message}</p>
        </div>
      )}

      {!isPending && !response.success && (
        <form className="w-full space-y-3" onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <Mail
              className="pointer-events-none absolute left-3 h-4 w-4 text-accent"
              strokeWidth={1.5}
            />
            <Input
              type="email"
              placeholder={t("emailPlaceholder")}
              name="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || sendingEmail || count > 0 || !userEmail.trim()}
          >
            {sendingEmail
              ? tCommon("loading")
              : count > 0
              ? `${t("resendEmailLink")} (${count}s)`
              : t("resendEmailLink")}
          </Button>
        </form>
      )}

      {response.success && (
        <Button asChild className="w-full">
          <Link href="/auth/login">{t("loginButton")}</Link>
        </Button>
      )}
    </div>
  );
};

export default VerificationForm;
