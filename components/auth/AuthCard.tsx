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
    <div className="w-full max-w-md rounded-3xl border border-border bg-surface/90 backdrop-blur-xl p-6 sm:p-8 shadow-lg text-fg">
      <div className="flex flex-col w-full items-center text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          {page}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-muted">
          {headerText}
        </p>
      </div>

      <div className="w-full">
        {children}

        <div className="flex justify-center items-center text-xs sm:text-sm mt-4 gap-1.5 text-muted">
          <span>{backText}</span>
          <Link
            href={`/auth/${backLink}`}
            className="font-semibold text-accent hover:underline capitalize"
          >
            {backLink === "register" ? t("createAccountLink") : t("signInLink")}
          </Link>
        </div>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px bg-border flex-1" />
          <span className="text-xs font-medium text-subtle">
            {t("orContinueWith")}
          </span>
          <div className="h-px bg-border flex-1" />
        </div>

        <OAuthCard />
      </div>
    </div>
  );
};

export default AuthCard;
