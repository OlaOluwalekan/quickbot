import Registered from "@/components/auth/Registered";

interface RegisteredPageProps {
  searchParams: Promise<{ accountId?: string }>;
}

const RegisteredPage = async ({ searchParams }: RegisteredPageProps) => {
  const resolvedParams = await searchParams;
  const accountId = resolvedParams?.accountId || null;

  return (
    <div className="h-screen flex justify-center items-center">
      <Registered accountId={accountId} />
    </div>
  );
};

export default RegisteredPage;
