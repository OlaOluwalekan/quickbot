"use client";

import clsx from "clsx";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const Logout = ({ styleClass }: { styleClass?: string }): React.JSX.Element => {
  const t = useTranslations("Chat");
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/auth/login");
          router.refresh();
        },
      },
    });
  };

  return (
    <button
      type="button"
      className={clsx(
        "flex justify-start items-center gap-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
        styleClass
          ? styleClass
          : "w-full px-3 py-2 text-danger hover:bg-danger/10"
      )}
      onClick={handleSignOut}
    >
      <LogOut className="h-4 w-4" strokeWidth={1.5} />
      <span>{t("logout")}</span>
    </button>
  );
};

export default Logout;
