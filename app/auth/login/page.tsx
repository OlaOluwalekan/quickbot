import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import AuthCard from "@/components/auth/AuthCard";
import AuthWrapper from "@/components/auth/AuthWrapper";
import LoginForm from "@/components/auth/LoginForm";
import { useTranslations } from "next-intl";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.auth");
  return {
    title: `${t("loginTitle")} · Klecx`,
    description: t("loginDescription"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

const LoginPage = () => {
  const t = useTranslations("Auth");

  return (
    <AuthWrapper>
      <AuthCard
        page={t("loginTitle")}
        headerText={t("loginSubtitle")}
        backText={t("noAccount")}
        backLink="register"
      >
        <Suspense fallback={<div className="h-40" />}>
          <LoginForm />
        </Suspense>
      </AuthCard>
    </AuthWrapper>
  );
};

export default LoginPage;
