"use client";

import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock, FaUser } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import Alert from "../alert/Alert";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { RegisterSchema } from "@/lib/schemas/auth";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";

const RegisterForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [response, setResponse] = useState({
    message: "",
    success: false,
  });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!response.message) return;
    const interval = setTimeout(() => {
      setResponse({ message: "", success: false });
    }, 3500);

    return () => clearTimeout(interval);
  }, [response]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponse({ message: "", success: false });

    const parsed = RegisterSchema.safeParse(formData);
    if (!parsed.success) {
      const firstIssue =
        parsed.error.issues[0]?.message || "Invalid registration details";
      setResponse({ message: firstIssue, success: false });
      return;
    }

    startTransition(async () => {
      try {
        const { error } = await authClient.signUp.email({
          email: parsed.data.email,
          name: parsed.data.name,
          password: parsed.data.password,
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });

        if (error) {
          setResponse({
            message: error.message || "Registration failed",
            success: false,
          });
          return;
        }

        setResponse({
          message: "Registration successful! Check your inbox to verify your email.",
          success: true,
        });

        router.push(
          `/auth/registered?accountId=${encodeURIComponent(parsed.data.email)}`
        );
      } catch (err: unknown) {
        setResponse({
          message: err instanceof Error ? err.message : "Registration failed",
          success: false,
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
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
        type="text"
        placeholder={t("namePlaceholder")}
        icons={<FaUser />}
        name="name"
        id="name"
        value={formData.name}
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

      <InputWithIcon
        type="password"
        placeholder={t("confirmPasswordPlaceholder")}
        icons={<FaLock />}
        name="confirmPassword"
        id="confirmPassword"
        value={formData.confirmPassword}
        onChange={handleChange}
      />

      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      <BasicButton
        type="submit"
        size="full"
        text={isPending ? t("registering") : t("registerButton")}
        disabled={isPending}
        theme="primary"
      />
    </form>
  );
};

export default RegisterForm;
