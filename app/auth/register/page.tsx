import AuthCard from "@/components/auth/AuthCard";
import AuthWrapper from "@/components/auth/AuthWrapper";
import RegisterForm from "@/components/auth/RegisterForm";
import { useTranslations } from "next-intl";

const RegisterPage = () => {
  const t = useTranslations("Auth");

  return (
    <AuthWrapper>
      <AuthCard
        page={t("registerTitle")}
        headerText={t("registerSubtitle")}
        backText={t("alreadyHaveAccount")}
        backLink="login"
      >
        <RegisterForm />
      </AuthCard>
    </AuthWrapper>
  );
};

export default RegisterPage;
