import * as React from "react";
import AuthWrapper from "@/components/auth/AuthWrapper";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset Password · Klecx",
  description: "Set a new secure password for your Klecx account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthWrapper>
      <React.Suspense fallback={<div className="text-xs text-fg-subtle">Loading...</div>}>
        <ResetPasswordForm />
      </React.Suspense>
    </AuthWrapper>
  );
}
