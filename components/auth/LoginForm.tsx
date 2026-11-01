"use client";

import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { Lock, Mail } from "lucide-react";
import BasicButton from "../ui/button/BasicButton";
import { useRouter } from "next/navigation";
import Alert from "../alert/Alert";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";

const LoginForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isPending, startTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [needsVerification, setNeedsVerification] = useState(false);
  const [response, setResponse] = useState<{
    message: string;
    success: boolean;
  }>({
    message: "",
    success: false,
  });
  const router = useRouter();

  useEffect(() => {
    if (!response.message || needsVerification) return;
    const interval = setTimeout(() => {
      setResponse({ message: "", success: false });
    }, 3500);

    return () => clearTimeout(interval);
  }, [response, needsVerification]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponse({ message: "", success: false });
    setNeedsVerification(false);

    startTransition(async () => {
      try {
        const { error } = await authClient.signIn.email({
          email: formData.email.trim(),
          password: formData.password,
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });

        if (error) {
          const isUnverified =
            error.status === 403 ||
            error.code === "EMAIL_NOT_VERIFIED" ||
            error.message?.toLowerCase().includes("verif");

          if (isUnverified) {
            setNeedsVerification(true);
            setResponse({
              message: "Please check your inbox and verify your email address before signing in.",
              success: false,
            });
            return;
          }

          setResponse({
            message: "Invalid email or password",
            success: false,
          });
          return;
        }

        setResponse({
          message: "Signed in successfully",
          success: true,
        });
        router.push(DEFAULT_LOGIN_REDIRECT);
        router.refresh();
      } catch {
        setResponse({
          message: "Invalid email or password",
          success: false,
        });
      }
    });
  };

  const handleResendVerification = () => {
    if (!formData.email.trim()) return;
    startResendTransition(async () => {
      try {
        await authClient.sendVerificationEmail({
          email: formData.email.trim(),
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });
        setResponse({
          message: "Verification email sent. Please check your inbox.",
          success: true,
        });
      } catch {
        setResponse({
          message: "If the account exists, a verification email was sent.",
          success: true,
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <InputWithIcon
        type="email"
        placeholder={t("emailPlaceholder")}
        icons={<Mail className="h-4 w-4" strokeWidth={1.5} />}
        name="email"
        value={formData.email}
        onChange={handleChange}
      />
      <InputWithIcon
        type="password"
        placeholder={t("passwordPlaceholder")}
        icons={<Lock className="h-4 w-4" strokeWidth={1.5} />}
        name="password"
        value={formData.password}
        onChange={handleChange}
      />

      <div className="flex justify-end pt-1">
        <Link
          href="/auth/forgot-password"
          className="text-xs font-medium text-muted hover:text-accent transition-colors"
        >
          {t("forgotPasswordLink")}
        </Link>
      </div>

      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      {needsVerification && (
        <BasicButton
          type="button"
          text={isResending ? t("loggingIn") : t("resendEmailLink")}
          size="full"
          theme="outline"
          disabled={isResending}
          onClick={handleResendVerification}
        />
      )}

      <BasicButton
        type="submit"
        text={isPending ? t("loggingIn") : t("loginButton")}
        size="full"
        theme="primary"
        disabled={isPending}
      />
    </form>
  );
};

export default LoginForm;
