"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { useRouter } from "next/navigation";
import { login } from "@/utils/actions/login";
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
  const [response, setResponse] = useState({
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

    startTransition(() => {
      login(submittedData).then((res) => {
        setResponse(res);
        if (res.message?.includes("not verified") && res.data?.email) {
          router.push(
            `/auth/registered?accountId=${encodeURIComponent(res.data.email)}`
          );
        }
        if (res.success) {
          router.push("/chat");
          router.refresh();
        }
      });
    });
  };

  return (
    <form action={handleSubmit} className="space-y-3" noValidate>
      <InputWithIcon
        type="email"
        placeholder={t("emailPlaceholder")}
        icons={<FaEnvelope />}
        name="email"
        id="email"
        value={formData.email}
        onChange={handleChange}
      />

      <InputWithIcon
        type="password"
        placeholder={t("passwordPlaceholder")}
        icons={<FaLock />}
        name="password"
        id="password"
        value={formData.password}
        onChange={handleChange}
      />

      <div className="flex justify-end">
        <Link
          href="/auth/forgot-password"
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {t("forgotPasswordLink")}
        </Link>
      </div>

      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      <BasicButton
        type="submit"
        size="full"
        text={isPending ? t("loggingIn") : t("loginButton")}
        disabled={isPending}
        theme="primary"
      />
    </form>
  );
};

export default LoginForm;
