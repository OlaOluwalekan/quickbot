import Features from "@/components/general/Features";
import Header from "@/components/general/Header";
import Hero from "@/components/general/Hero";
import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import LinkButton from "@/components/ui/button/LinkButton";
import { useTranslations } from "next-intl";

const Home = () => {
  const t = useTranslations("Landing");

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
      <Header />

      <main className="mx-auto flex w-full max-w-7xl grow flex-col px-4 sm:px-6 lg:px-8">
        <Hero />
        <Features />

        {/* Call To Action Banner */}
        <section className="my-12 rounded-3xl bg-linear-to-r from-indigo-600 via-indigo-500 to-sky-500 p-8 text-center text-white shadow-xl shadow-indigo-500/20 sm:my-20 sm:p-12">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
            {t("ctaTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-indigo-100 sm:text-base">
            {t("ctaDescription")}
          </p>
          <div className="mt-6 flex justify-center">
            <LinkButton
              href="/auth/register"
              size="large"
              text={t("ctaButton")}
              theme="base"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 px-4 py-8 sm:px-6 lg:px-8 dark:border-slate-800/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-slate-500 sm:flex-row dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Logo size="icon" />
            <AppName />
            <span className="ml-2">— {t("footerTagline")}</span>
          </div>
          <p>
            © {new Date().getFullYear()} Klecx. {t("footerRights")}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
