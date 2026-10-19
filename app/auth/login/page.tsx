import AuthCard from "@/components/auth/AuthCard";
import AuthWrapper from "@/components/auth/AuthWrapper";
import LoginForm from "@/components/auth/LoginForm";
import { useTranslations } from "next-intl";

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
        <LoginForm />
      </AuthCard>
    </AuthWrapper>
  );
};

export default LoginPage;
