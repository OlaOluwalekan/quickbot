import { ReactNode } from "react";
import Link from "next/link";
import Logo from "../logo/Logo";
import AppName from "../logo/AppName";
import LocaleSwitcher from "../general/LocaleSwitcher";

const AuthWrapper = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-bg relative overflow-hidden px-4 py-6">
      {/* Ambient Radial Accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-accent-soft blur-3xl"
      />

      {/* Top Navigation Bar */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between z-20">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="icon" />
          <AppName />
        </Link>
        <LocaleSwitcher />
      </div>

      {/* Main Centered Auth Card */}
      <div className="w-full flex-grow flex justify-center items-center py-8 z-20">
        {children}
      </div>

      <div className="text-center text-xs text-subtle z-20">
        © {new Date().getFullYear()} Klecx
      </div>
    </div>
  );
};

export default AuthWrapper;
