"use client";

import { FcGoogle } from "react-icons/fc";
import OAuthButton from "../ui/button/OAuthButton";
import { FaGithub } from "react-icons/fa6";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

const OAuthCard = (): React.JSX.Element => {
  const t = useTranslations("Auth");

  const handleClick = (provider: "google" | "github") => {
    signIn(provider, {
      callbackUrl: DEFAULT_LOGIN_REDIRECT,
    });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <OAuthButton
        icon={<FcGoogle />}
        text={t("google")}
        onClick={() => handleClick("google")}
      />
      <OAuthButton
        icon={<FaGithub />}
        text={t("github")}
        onClick={() => handleClick("github")}
      />
    </div>
  );
};

export default OAuthCard;
