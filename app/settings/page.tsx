import { getActor } from "@/server/auth/session";
import Logout from "@/components/auth/Logout";
import LocaleSwitcher from "@/components/general/LocaleSwitcher";
import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import NameAndEmail from "@/components/settings/NameAndEmail";
import SettingsCard from "@/components/settings/SettingsCard";
import TokensDisplay from "@/components/settings/TokensDisplay";
import UserProfileImage from "@/components/settings/UserProfileImage";
import LinkButton from "@/components/ui/button/LinkButton";
import { SessionProps } from "@/types/user";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

const SettingsPage = async () => {
  const actor = await getActor();
  const t = await getTranslations("Settings");

  const sessionUser: SessionProps | undefined = actor
    ? {
        id: actor.userId,
        name: actor.name ?? "",
        email: actor.email,
        image: actor.image ?? "",
        token: 0,
      }
    : undefined;

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link href="/workspaces" className="flex items-center gap-2">
            <Logo size="icon" />
            <AppName />
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <LinkButton
              href="/workspaces"
              size="small"
              theme="primary"
              text={t("backToChat")}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6 items-center">
        <div className="w-full">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("subtitle")}
          </p>
        </div>

        <SettingsCard>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Profile Column */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-6 lg:border-r lg:border-slate-200 dark:lg:border-slate-800 lg:pr-6">
              <div className="flex flex-col sm:flex-row lg:flex-col items-center sm:items-start gap-4">
                <UserProfileImage user={sessionUser as SessionProps} />
                <NameAndEmail user={sessionUser as SessionProps} />
              </div>

              <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t("languageLabel")}
                  </span>
                  <LocaleSwitcher />
                </div>

                <div className="pt-2">
                  <Logout styleClass="w-full justify-center px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer" />
                </div>
              </div>
            </div>

            {/* Token Usage Column */}
            <div className="lg:col-span-7">
              <TokensDisplay user={sessionUser as SessionProps} />
            </div>
          </div>
        </SettingsCard>
      </main>
    </div>
  );
};

export default SettingsPage;
