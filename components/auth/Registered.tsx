"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { Mail, MailCheck } from "lucide-react";
import BasicButton from "../ui/button/BasicButton";
import Alert from "../alert/Alert";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";

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
    if (!response.message) return;
    const interval = setTimeout(() => {
      setResponse({ message: "", success: false });
    }, 3500);

    return () => clearTimeout(interval);
  }, [response]);

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
        handleResendClick();
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
          <Alert
            message="No account email provided. Redirecting..."
            success={false}
          />
        )}

        <InputWithIcon
          type="email"
          placeholder={t("emailPlaceholder")}
          icons={<Mail className="h-4 w-4" strokeWidth={1.5} />}
          name="email"
          value={userEmail}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setUserEmail(e.target.value)
          }
          readonly={true}
        />

        {response.message && (
          <Alert message={response.message} success={response.success} />
        )}

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
          disabled={sendingEmail || count > 0 || !userEmail}
        />
      </form>
    </div>
  );
};

export default Registered;
