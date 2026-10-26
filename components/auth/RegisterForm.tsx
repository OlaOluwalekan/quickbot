"use client";

import { ChangeEvent, FormEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock, FaUser } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import Alert from "../alert/Alert";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
    data: null,
  });
  const [isPending, startTransition] = useTransition();
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

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponse({ message: "", success: false, data: null });

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const json = await res.json();
        setResponse(json);

        if (json.success && json.data?.email) {
          router.push(
            `/auth/registered?accountId=${encodeURIComponent(json.data.email)}`
          );
        }
      } catch (err: any) {
        setResponse({
          message: err?.message || "Registration failed",
          success: false,
          data: null,
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
