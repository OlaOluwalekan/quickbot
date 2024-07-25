import AuthCard from "@/components/auth/AuthCard";
import RegisterForm from "@/components/auth/RegisterForm";
import React from "react";

const RegisterPage = () => {
  return (
    <div className="flex justify-center items-center min-h-screen bg-base-100">
      <AuthCard
        page="Register"
        headerText="Create your account in one simple click"
        backText="Already have an account"
        backLink="login"
      >
        <RegisterForm />
      </AuthCard>
    </div>
  );
};

export default RegisterPage;
