"use client";

import clsx from "clsx";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import LinkButton from "../ui/button/LinkButton";
import { useTranslations } from "next-intl";

const RESEND_SECONDS = 15;

const VerificationForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const params = useSearchParams();
  const token = params.get("token");
  const [isPending, startTransition] = useTransition();
  const [sendingEmail, startSendingEmail] = useTransition();
  const [response, setResponse] = useState<{
    message: string;
    success: boolean;
    data: any;
  }>({
    message: "",
    success: false,
    data: null,
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
    setResponse({ message: "", success: false, data: null });
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!json.success && json.data?.email) {
          setUserEmail(json.data.email);
        }
        setResponse(json);
      } catch {
        setResponse({
          message: t("verifiedError"),
          success: false,
          data: null,
        });
      }
    });
  }, [token, t]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponse({ message: "", success: false, data: null });

    startSendingEmail(async () => {
      try {
        const res = await fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail }),
        });
        const json = await res.json();
        setResponse(json);
        if (json.success) {
          handleResendClick();
        }
      } catch {
        setResponse({
          message: t("verifiedError"),
          success: false,
          data: null,
        });
      }
    });
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-indigo-500/10 text-center flex flex-col items-center gap-4">
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
        {t("verifyingTitle")}
      </h1>

      {isPending && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("verifyingSubtitle")}
        </p>
      )}

      {!isPending && response.message && (
        <div
          className={clsx(
            "w-full text-sm flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border font-medium",
            response.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
          )}
        >
          <span>
            {response.success ? <FaCheckCircle /> : <FaTimesCircle />}
          </span>
          <p>{response.message}</p>
        </div>
      )}

      {!isPending && !response.success && response.data && (
        <form className="w-full space-y-3" onSubmit={handleSubmit}>
          <InputWithIcon
            type="email"
            placeholder={t("emailPlaceholder")}
            icons={<FaEnvelope />}
            name="email"
            value={userEmail}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUserEmail(e.target.value)
            }
            readonly={true}
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
            disabled={isPending || sendingEmail || count > 0}
          />
        </form>
      )}

      {!isPending && !response.data && !response.success && (
        <LinkButton
          size="full"
          href="/auth/register"
          text={t("registerButton")}
          theme="primary"
        />
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
