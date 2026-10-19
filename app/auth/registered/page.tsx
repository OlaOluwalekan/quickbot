import AuthWrapper from "@/components/auth/AuthWrapper";
import Registered from "@/components/auth/Registered";

interface RegisteredPageProps {
  searchParams: Promise<{ accountId?: string }>;
}

const RegisteredPage = async ({ searchParams }: RegisteredPageProps) => {
  const resolvedParams = await searchParams;
  const accountId = resolvedParams?.accountId || null;

  return (
    <AuthWrapper>
      <Registered accountId={accountId} />
    </AuthWrapper>
  );
};

export default RegisteredPage;
