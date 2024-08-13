"use client";

import { FcGoogle } from "react-icons/fc";
import OAuthButton from "../ui/button/OAuthButton";
import { FaGithub } from "react-icons/fa6";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";
import { signIn } from "next-auth/react";

const OAuthCard = () => {
  const handleClick = (provider: "google" | "github") => {
    signIn(provider, {
      callbackUrl: DEFAULT_LOGIN_REDIRECT,
    });
  };

  return (
    <div className="flex justify-center items-center gap-5">
      <OAuthButton icon={<FcGoogle />} onClick={() => handleClick("google")} />
      <OAuthButton icon={<FaGithub />} onClick={() => handleClick("github")} />
    </div>
  );
};

export default OAuthCard;
