"use client";

import clsx from "clsx";
import { signOut } from "next-auth/react";
import { BiLogOut } from "react-icons/bi";
import { useTranslations } from "next-intl";

const Logout = ({ styleClass }: { styleClass?: string }): React.JSX.Element => {
  const t = useTranslations("Chat");

  return (
    <button
      type="button"
      className={clsx(
        "flex justify-start items-center gap-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer",
        styleClass
          ? styleClass
          : "w-full px-3 py-2 text-rose-500 hover:bg-rose-500/10"
      )}
      onClick={() => signOut()}
    >
      <BiLogOut className="text-base" />
      <span>{t("logout")}</span>
    </button>
  );
};

export default Logout;
