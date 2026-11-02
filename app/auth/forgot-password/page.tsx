import * as React from "react";
import AuthWrapper from "@/components/auth/AuthWrapper";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Forgot Password · Klecx",
  description: "Reset your Klecx account password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthWrapper>
      <ForgotPasswordForm />
    </AuthWrapper>
  );
}
