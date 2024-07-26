import AuthCard from "@/components/auth/AuthCard";
import LoginForm from "@/components/auth/LoginForm";

const LoginPage = () => {
  return (
    <div className="flex justify-center items-center min-h-screen bg-base-100">
      <AuthCard
        page="Login"
        headerText="Welcome back. Provide your login details"
        backText="No Account"
        backLink="register"
      >
        <LoginForm />
      </AuthCard>
    </div>
  );
};

export default LoginPage;
