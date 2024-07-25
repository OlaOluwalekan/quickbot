import { LogoProps } from "@/types/logo-types";
import clsx from "clsx";
import Image from "next/image";
import { sizeClass } from "./logo.config";

const Logo = ({ size }: LogoProps) => {
  return (
    <Image
      width="196"
      height="248"
      src="/logo.png"
      alt="Logo"
      className={clsx(sizeClass(size))}
    />
  );
};

export default Logo;
