"use client";

import { getUserByEmail } from "@/utils/actions/user";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaEnvelopeCircleCheck } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import Alert from "../alert/Alert";
import { useTranslations } from "next-intl";

const RESEND_SECONDS = 15;
const REDIRECT_MILLISECONDS = 3000;

const Registered = ({
  accountId: email,
}: {
  accountId: string | null;
}): React.JSX.Element | null => {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [sendingEmail, startSendingEmail] = useTransition();
  const [pageIsLoading, setPageIsLoading] = useState(true);
  const [response, setResponse] = useState({
    message: "",
    success: false,
    data: null,
  });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!email) {
      router.push("/auth/register");
    }
  }, [email, router]);

  const handleResendClick = () => {
    setCount(RESEND_SECONDS);
  };

  useEffect(() => {
    if (email) {
      startTransition(() => {
        getUserByEmail(email).then((data) => {
          if (data) {
            if (data.emailVerified) {
              router.push("/auth/login");
            }
            setUser(data);
            setUserEmail(data.email as string);
          } else {
            setTimeout(() => {
              router.push("/auth/register");
            }, REDIRECT_MILLISECONDS);
          }
          setPageIsLoading(false);
        });
      });
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

  useEffect(() => {
    const interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3500);

    return () => clearTimeout(interval);
  }, [response]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponse({ message: "", success: false, data: null });

    startSendingEmail(async () => {
      try {
        const res = await fetch("/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail || email }),
        });
        const json = await res.json();
        setResponse(json);
        if (json.success) {
          handleResendClick();
        }
      } catch (err: any) {
        setResponse({
          message: err?.message || "Failed to send verification email",
          success: false,
          data: null,
        });
      }
    });
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-indigo-500/10 text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-500 flex items-center justify-center text-2xl mx-auto mb-4">
        <FaEnvelopeCircleCheck />
      </div>

      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
        {t("registeredTitle")}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate>
        {isPending || pageIsLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tCommon("loading")}
          </p>
        ) : user ? (
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t("registeredDescription")}
          </p>
        ) : (
          <Alert
            message={`The email ${email} was not found. Redirecting...`}
            success={false}
          />
        )}

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
          disabled={isPending || sendingEmail || count > 0}
        />
      </form>
    </div>
  );
};

export default Registered;
