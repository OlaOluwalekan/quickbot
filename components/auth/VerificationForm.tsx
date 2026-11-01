"use client";

import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import BasicButton from "../ui/button/BasicButton";
import LinkButton from "../ui/button/LinkButton";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";

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

  const handleResendClick = () => {
    setCount(RESEND_SECONDS);
  };

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
        handleResendClick();
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
          <InputWithIcon
            type="email"
            placeholder={t("emailPlaceholder")}
            icons={<Mail className="h-4 w-4" strokeWidth={1.5} />}
            name="email"
            value={userEmail}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUserEmail(e.target.value)
            }
          />

          <BasicButton
            type="submit"
            text={
              sendingEmail
                ? tCommon("loading")
                : count > 0
                ? `${t("resendEmailLink")} (${count}s)`
                : t("resendEmailLink")
            }
            size="full"
            theme="primary"
            disabled={isPending || sendingEmail || count > 0 || !userEmail.trim()}
          />
        </form>
      )}

      {response.success && (
        <LinkButton
          href="/auth/login"
          text={t("loginButton")}
          size="full"
          theme="primary"
        />
      )}
    </div>
  );
};

export default VerificationForm;
