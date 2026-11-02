import * as React from "react";
import AuthWrapper from "@/components/auth/AuthWrapper";
import VerificationForm from "@/components/auth/VerificationForm";

export const metadata = {
  title: "Verify Email · Klecx",
  description: "Verify your email address for your Klecx account.",
};

export default function VerifyEmailPage() {
  return (
    <AuthWrapper>
      <React.Suspense fallback={<div className="text-xs text-fg-subtle">Verifying email...</div>}>
        <VerificationForm />
      </React.Suspense>
    </AuthWrapper>
  );
}
