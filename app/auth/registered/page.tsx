import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import AuthWrapper from "@/components/auth/AuthWrapper";
import Registered from "@/components/auth/Registered";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata.auth");
  return {
    title: t("registeredTitle"),
    description: t("registeredDescription"),
    robots: {
      index: false,
      follow: false,
    },
  };
}

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
