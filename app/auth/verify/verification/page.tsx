import AuthWrapper from "@/components/auth/AuthWrapper";
import VerificationForm from "@/components/auth/VerificationForm";
import React, { Suspense } from "react";

const VerificationPage = () => {
  return (
    <AuthWrapper>
      <Suspense fallback={<div className="text-sm">Loading...</div>}>
        <VerificationForm />
      </Suspense>
    </AuthWrapper>
  );
};

export default VerificationPage;
