"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { useRouter } from "next/navigation";
import Alert from "../alert/Alert";
import Link from "next/link";
import { useTranslations } from "next-intl";

const LoginForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState<{
    message: string;
    success: boolean;
    data: any;
  }>({
    message: "",
    success: false,
    data: null,
  });
  const router = useRouter();

  useEffect(() => {
    const interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3500);

    return () => clearTimeout(interval);
  }, [response]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (submittedData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: submittedData.get("email"),
            password: submittedData.get("password"),
          }),
        });
        const result = await res.json();
        setResponse(result);
        if (result.success) {
          router.push("/chat");
          router.refresh();
        }
      } catch (err: unknown) {
        setResponse({
          message: err instanceof Error ? err.message : "An error occurred",
          success: false,
          data: null,
        });
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-3" noValidate>
      <InputWithIcon
        type="email"
        placeholder={t("emailPlaceholder")}
        icons={<FaEnvelope />}
        name="email"
        value={formData.email}
        onChange={handleChange}
      />
      <InputWithIcon
        type="password"
        placeholder={t("passwordPlaceholder")}
        icons={<FaLock />}
        name="password"
        value={formData.password}
        onChange={handleChange}
      />

      <div className="flex justify-end pt-1">
        <Link
          href="/auth/forgot-password"
          className="text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
        >
          {t("forgotPasswordLink")}
        </Link>
      </div>

      {response.message && (
        <Alert message={response.message} success={response.success} />
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
