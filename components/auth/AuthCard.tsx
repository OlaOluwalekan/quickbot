"use client";

import { AuthCardProps } from "@/types/auth";
import Link from "next/link";
import OAuthCard from "./OAuthCard";
import { useTranslations } from "next-intl";

const AuthCard = ({
  children,
  page,
  headerText,
  backText,
  backLink,
}: AuthCardProps) => {
  const t = useTranslations("Auth");

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-indigo-500/10 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col w-full items-center text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {page}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {headerText}
        </p>
      </div>

      <div className="w-full">
        {children}

        <div className="flex justify-center items-center text-xs sm:text-sm mt-4 gap-1.5 text-slate-600 dark:text-slate-400">
          <span>{backText}</span>
          <Link
            href={`/auth/${backLink}`}
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline capitalize"
          >
            {backLink === "register" ? t("createAccountLink") : t("signInLink")}
          </Link>
        </div>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            {t("orContinueWith")}
          </span>
          <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
        </div>

        <OAuthCard />
      </div>
    </div>
  );
};

export default AuthCard;
