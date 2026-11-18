import * as React from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import AuthWrapper from "@/components/auth/AuthWrapper";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.auth");
  return {
    title: `${t("resetPasswordTitle")} · Klecx`,
    description: t("resetPasswordDescription"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default function ResetPasswordPage() {
  return (
    <AuthWrapper>
      <React.Suspense fallback={<div className="text-xs text-fg-subtle">Loading...</div>}>
        <ResetPasswordForm />
      </React.Suspense>
    </AuthWrapper>
  );
}
