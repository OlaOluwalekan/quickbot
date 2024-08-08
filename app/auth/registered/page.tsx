import Registered from "@/components/auth/Registered";

const RegisteredPage = ({ searchParams }: { searchParams: any }) => {
  const { accountId } = searchParams;

  return (
    <div className="h-screen flex justify-center items-center">
      <Registered accountId={accountId} />
    </div>
  );
};

export default RegisteredPage;
