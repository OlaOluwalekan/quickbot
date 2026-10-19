import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import StoreProvider from "@/providers/StoreProvider";
import ThemeProvider from "@/providers/ThemeProvider";
import Theme from "@/components/theme/Theme";
import { Toaster } from "react-hot-toast";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`main bg-base-100 text-base-content dark:bg-dark-base-100 dark:text-dark-base-content antialiased selection:bg-indigo-500/20 selection:text-indigo-500 ${inter.className}`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <StoreProvider>
            <ThemeProvider>
              {children}
              <Theme />
              <Toaster
                position="top-right"
                toastOptions={{
                  className:
                    "!bg-slate-900 !text-slate-100 !border !border-slate-800 !rounded-xl !text-sm",
                }}
              />
            </ThemeProvider>
          </StoreProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
