import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import AuthWrapper from "@/components/auth/AuthWrapper";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.auth");
  return {
    title: t("forgotPasswordTitle"),
    description: t("forgotPasswordDescription"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function ForgotPasswordPage() {
  return (
    <AuthWrapper>
      <ForgotPasswordForm />
    </AuthWrapper>
  );
}
