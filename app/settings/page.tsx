import { getActor } from "@/server/auth/session";
import Logout from "@/components/auth/Logout";
import LocaleSwitcher from "@/components/general/LocaleSwitcher";
import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import NameAndEmail from "@/components/settings/NameAndEmail";
import SettingsCard from "@/components/settings/SettingsCard";
import TokensDisplay from "@/components/settings/TokensDisplay";
import UserProfileImage from "@/components/settings/UserProfileImage";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen w-full bg-bg text-fg flex flex-col">
      {/* Top Navbar */}
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <Link href="/workspaces" className="flex items-center gap-2">
            <Logo size="icon" />
            <AppName />
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <Button asChild size="sm">
              <Link href="/workspaces">{t("backToChat")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6 items-center">
        <div className="w-full">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            {t("subtitle")}
          </p>
        </div>

        <SettingsCard>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Profile Column */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-6 lg:border-r lg:border-border lg:pr-6">
              <div className="flex flex-col sm:flex-row lg:flex-col items-center sm:items-start gap-4">
                <UserProfileImage user={sessionUser as SessionProps} />
                <NameAndEmail user={sessionUser as SessionProps} />
              </div>

              <div className="pt-4 border-t border-border flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted">
                    {t("languageLabel")}
                  </span>
                  <LocaleSwitcher />
                </div>

                <div className="pt-2">
                  <Logout styleClass="w-full justify-center px-4 py-2.5 rounded-xl bg-danger/10 border border-danger/25 text-danger hover:bg-danger hover:text-accent-fg transition-colors cursor-pointer" />
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
