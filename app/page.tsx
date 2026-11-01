import Link from "next/link";
import Features from "@/components/general/Features";
import Header from "@/components/general/Header";
import Hero from "@/components/general/Hero";
import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

const Home = () => {
  const t = useTranslations("Landing");

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-bg text-fg">
      <Header />

      <main className="mx-auto flex w-full max-w-7xl grow flex-col px-4 sm:px-6 lg:px-8">
        <Hero />
        <Features />

        {/* Call To Action Banner */}
        <section className="my-12 rounded-3xl bg-accent p-8 text-center text-accent-fg shadow-lg sm:my-20 sm:p-12">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">
            {t("ctaTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-90 sm:text-base">
            {t("ctaDescription")}
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild variant="secondary" size="lg">
              <Link href="/auth/register">{t("ctaButton")}</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-muted sm:flex-row">
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
