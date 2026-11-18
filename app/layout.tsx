import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { HIGHLIGHT_CSS } from "@/lib/annotations/highlight-styles";
import QueryProvider from "@/components/providers/query-provider";
import { SiteConfigProvider } from "@/components/providers/site-config-provider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { getSiteConfig } from "@/server/config/site";
import { getLocaleDefinition, getAlternateOgLocales } from "@/i18n/locales";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = getSiteConfig().appUrl;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const localeDef = getLocaleDefinition(locale);
  const t = await getTranslations("Metadata");
  const site = getSiteConfig();
  const xHandle = site.social.x
    ? new URL(site.social.x).pathname.split("/").filter(Boolean)[0]
    : undefined;

  const defaultTitle = t("root.title");
  const titleTemplate = t("root.titleTemplate");
  const description = t("root.description");
  const applicationName = t("root.applicationName");
  const keywordsString = t("root.keywords");
  const keywords = keywordsString.split(",").map((k) => k.trim());

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: defaultTitle,
      template: titleTemplate,
    },
    description,
    applicationName,
    authors: [{ name: site.appName }],
    keywords,
    manifest: "/manifest.webmanifest",
    // Icons come from the file conventions: app/favicon.ico, app/icon.tsx and
    // app/apple-icon.tsx, all drawn from lib/brand/mark.ts (F5.10).
    openGraph: {
      type: "website",
      locale: localeDef.ogLocale,
      alternateLocale: getAlternateOgLocales(locale),
      url: siteUrl,
      siteName: site.appName,
      title: defaultTitle,
      description,
      // Images: app/opengraph-image.tsx and app/twitter-image.tsx (localized).
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
      ...(xHandle ? { creator: `@${xHandle}` } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const siteConfig = getSiteConfig();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: HIGHLIGHT_CSS }} />
      </head>
      <body className="bg-bg text-fg font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SiteConfigProvider value={siteConfig}>
            <QueryProvider>
              <ThemeProvider
                attribute="data-theme"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <OfflineBanner />
                {children}
                <Toaster position="bottom-right" />
              </ThemeProvider>
            </QueryProvider>
          </SiteConfigProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
