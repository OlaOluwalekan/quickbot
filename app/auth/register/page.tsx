import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import AuthCard from "@/components/auth/AuthCard";
import AuthWrapper from "@/components/auth/AuthWrapper";
import RegisterForm from "@/components/auth/RegisterForm";
import { useTranslations } from "next-intl";
import { PLANS } from "@/server/billing/plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.auth");
  return {
    title: `${t("registerTitle")} · Klecx`,
    description: t("registerDescription"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

const RegisterPage = () => {
  const t = useTranslations("Auth");

  return (
    <AuthWrapper>
      <AuthCard
        page={t("registerTitle")}
        headerText={t("registerSubtitle", { credits: PLANS.FREE.credits })}
        backText={t("alreadyHaveAccount")}
        backLink="login"
      >
        <RegisterForm />
      </AuthCard>
    </AuthWrapper>
  );
};

export default RegisterPage;
