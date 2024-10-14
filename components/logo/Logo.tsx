"use client";

import { LogoProps } from "@/types/logo-types";
import clsx from "clsx";
import Image from "next/image";
import { sizeClass } from "./logo.config";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

const Logo = ({ size }: LogoProps) => {
  const { theme } = useSelector((store: RootState) => store.general);

  const imageSrc = clsx({
    "/logo-light.png": theme === "light",
    "/logo-cupcake.png": theme === "cupcake",
    "/logo-dracula.png": theme === "dracula",
    "/logo-black.png": theme === "black",
  });

  return (
    <Image
      width="196"
      height="248"
      src={imageSrc}
      alt="Logo"
      className={clsx(sizeClass(size))}
    />
  );
};

export default Logo;

{
  /* <a target="_blank" href="https://icons8.com/icon/HRqoDlVZAD8t/bot">Bot</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a> */
}
