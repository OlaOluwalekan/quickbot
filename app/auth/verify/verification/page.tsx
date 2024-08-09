import VerificationForm from "@/components/auth/VerificationForm";
import React, { Suspense } from "react";

const VerificationPage = () => {
  return (
    <div>
      <Suspense fallback={<div>Loading...</div>}>
        <VerificationForm />
      </Suspense>
    </div>
  );
};

export default VerificationPage;
