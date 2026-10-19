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
    <div className="min-h-screen w-full flex flex-col bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <Header />

      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col">
        <Hero />
        <Features />

        {/* Call To Action Banner */}
        <section className="my-12 sm:my-20 rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 p-8 sm:p-12 text-center text-white shadow-xl shadow-indigo-500/20">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            {t("ctaTitle")}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-indigo-100 max-w-xl mx-auto">
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

      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
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
